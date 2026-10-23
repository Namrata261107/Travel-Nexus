
import json
import logging
import math
import subprocess
import tempfile
import uuid
from decimal import Decimal, InvalidOperation
from pathlib import Path

from django.db import connection, DatabaseError, transaction
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

logger = logging.getLogger(__name__)


# =========================================================
# COMMON RESPONSE HELPER
# =========================================================

def error_response(message, status=400):
    return JsonResponse({
        "success": False,
        "message": message,
    }, status=status)


def json_body(request):
    try:
        body = json.loads(request.body or b"{}")
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None, "Invalid JSON request."

    if not isinstance(body, dict):
        return None, "Request body must be a JSON object."

    return body, None


def isoformat_fields(records, fields):
    for record in records:
        for field in fields:
            value = record.get(field)
            if value is not None and hasattr(value, "isoformat"):
                record[field] = value.isoformat()
    return records


def rows_as_dicts(cursor):
    columns = [column[0] for column in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


# =========================================================
# HEALTH CHECK
# =========================================================

def health_check(request):
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()

        return JsonResponse({
            "success": True,
            "status": "healthy",
            "database": "connected",
        })
    except DatabaseError:
        logger.exception("Health check failed.")
        return error_response("Database connection failed.", 503)


# =========================================================
# DASHBOARD SUMMARY
# =========================================================

def dashboard_summary(request):
    queries = {
        "total_travelers": """
            SELECT COUNT(DISTINCT traveler_id)
            FROM public.traveler_profiles
            WHERE traveler_id IS NOT NULL
        """,
        "active_sessions": """
            SELECT COUNT(*)
            FROM public.travel_sessions
            WHERE LOWER(COALESCE(status, '')) = 'active'
        """,
        "total_alerts": """
            SELECT
                (SELECT COUNT(*) FROM public.emergency_alerts) +
                (SELECT COUNT(*) FROM public.traveler_sos_reports)
        """,
        "unresolved_alerts": """
            SELECT
                (SELECT COUNT(*)
                 FROM public.emergency_alerts
                 WHERE LOWER(COALESCE(status, ''))
                       NOT IN ('resolved', 'closed', 'false_alarm')) +
                (SELECT COUNT(*)
                 FROM public.traveler_sos_reports
                 WHERE LOWER(COALESCE(status, ''))
                       NOT IN ('resolved', 'closed', 'false_alarm'))
        """,
        "active_geofences": """
            SELECT COUNT(*)
            FROM public.geofences
            WHERE is_active = TRUE
        """,
        "open_lost_found_reports": """
            SELECT COUNT(*)
            FROM public.lost_found_reports
            WHERE LOWER(COALESCE(status, ''))
                  NOT IN ('resolved', 'closed', 'returned')
        """,
    }

    try:
        summary = {}

        with connection.cursor() as cursor:
            for key, sql in queries.items():
                cursor.execute(sql)
                summary[key] = cursor.fetchone()[0]

        return JsonResponse({
            "success": True,
            "data": summary,
        })

    except DatabaseError:
        logger.exception("Dashboard summary failed.")
        return error_response(
            "Could not retrieve dashboard summary.", 503
        )


# =========================================================
# TRAVELERS
# =========================================================

def travelers_list(request):
    if request.method != "GET":
        return error_response("Only GET is allowed.", 405)

    sql = """
        SELECT
            tp.id::text AS profile_id,
            tp.traveler_id,
            tp.created_at,
            COALESCE(NULLIF(p.full_name, ''), 'Name unavailable')
                AS traveler_name,
            p.email,
            p.phone,
            tp.nationality,
            tp.gender,
            tp.emergency_status,
            journey.destination,
            journey.start_time,
            journey.status AS journey_status,
            latest_location.latitude,
            latest_location.longitude,
            latest_location.recorded_at AS location_recorded_at
        FROM public.traveler_profiles tp
        LEFT JOIN public.profiles p
            ON p.id = tp.user_id
        LEFT JOIN LATERAL (
            SELECT ts.destination, ts.start_time, ts.status
            FROM public.travel_sessions ts
            WHERE ts.traveler_id = tp.id
            ORDER BY ts.start_time DESC NULLS LAST
            LIMIT 1
        ) journey ON TRUE
        LEFT JOIN LATERAL (
            SELECT latitude, longitude, recorded_at
            FROM public.traveler_locations
            WHERE traveler_id = tp.id
            ORDER BY recorded_at DESC
            LIMIT 1
        ) latest_location ON TRUE
        ORDER BY tp.created_at DESC
    """

    try:
        with connection.cursor() as cursor:
            cursor.execute(sql)
            records = rows_as_dicts(cursor)

        isoformat_fields(records, ["created_at", "start_time", "location_recorded_at"])

        return JsonResponse({
            "success": True,
            "count": len(records),
            "data": records,
        })

    except DatabaseError:
        logger.exception("Travelers query failed.")
        return error_response(
            "Could not retrieve traveler records.", 503
        )


# =========================================================
# EMERGENCY ALERTS
# =========================================================

def alerts_list(request):
    if request.method != "GET":
        return error_response("Only GET is allowed.", 405)

    sql = """
        SELECT
            alerts.id,
            alerts.alert_code,
            alerts.traveler_profile_id,
            alerts.traveler_name,
            alerts.traveler_id,
            alerts.alert_type,
            alerts.severity,
            alerts.title,
            alerts.description,
            alerts.latitude,
            alerts.longitude,
            alerts.status,
            alerts.assigned_authority,
            alerts.created_at,
            alerts.acknowledged_at,
            alerts.resolved_at
        FROM (
            SELECT
                ea.id::text AS id,
                ea.alert_code,
                ea.traveler_id::text AS traveler_profile_id,
                COALESCE(NULLIF(p.full_name, ''), 'Unknown traveler')
                    AS traveler_name,
                tp.traveler_id::text AS traveler_id,
                ea.alert_type,
                ea.severity,
                ea.title,
                ea.description,
                ea.latitude,
                ea.longitude,
                ea.status,
                ea.assigned_authority::text AS assigned_authority,
                ea.created_at,
                ea.acknowledged_at,
                ea.resolved_at
            FROM public.emergency_alerts ea
            LEFT JOIN public.traveler_profiles tp
                ON tp.id = ea.traveler_id
            LEFT JOIN public.profiles p
                ON p.id = tp.user_id

            UNION ALL

            SELECT
                s.id::text AS id,
                'SOS-' || LEFT(s.id::text, 8) AS alert_code,
                NULL::text AS traveler_profile_id,
                COALESCE(NULLIF(s.traveler_name, ''), 'Unknown traveler')
                    AS traveler_name,
                s.traveler_code AS traveler_id,
                'sos'::text AS alert_type,
                'critical'::text AS severity,
                'Traveler SOS Emergency'::text AS title,
                COALESCE(NULLIF(s.message, ''), 'Emergency SOS reported.')
                    AS description,
                s.latitude,
                s.longitude,
                CASE
                    WHEN LOWER(COALESCE(s.status, '')) = 'created'
                        THEN 'active'
                    ELSE s.status
                END AS status,
                NULL::text AS assigned_authority,
                s.created_at,
                NULL::timestamptz AS acknowledged_at,
                NULL::timestamptz AS resolved_at
            FROM public.traveler_sos_reports s

            UNION ALL

            SELECT
                ge.id::text AS id,
                'GEO-' || LEFT(ge.id::text, 8) AS alert_code,
                ge.traveler_id::text AS traveler_profile_id,
                COALESCE(NULLIF(p.full_name, ''), 'Unknown traveler')
                    AS traveler_name,
                tp.traveler_id::text AS traveler_id,
                'geofence_entry'::text AS alert_type,
                CASE
                    WHEN lower(g.zone_type) IN ('restricted', 'protected') THEN 'high'
                    WHEN lower(g.zone_type) IN ('caution', 'high_risk') THEN 'medium'
                    ELSE 'low'
                END AS severity,
                'Traveler entered a ' || replace(g.zone_type, '_', ' ') || ' zone: ' || g.name AS title,
                'Traveler ' || COALESCE(NULLIF(p.full_name, ''), 'Unknown traveler') ||
                    ' entered the ' || replace(g.zone_type, '_', ' ') ||
                    ' zone "' || g.name || '".'
                    AS description,
                ge.latitude,
                ge.longitude,
                ge.status,
                NULL::text AS assigned_authority,
                ge.created_at,
                ge.acknowledged_at,
                ge.resolved_at
            FROM public.geofence_entry_alerts ge
            JOIN public.geofences g ON g.id = ge.geofence_id
            LEFT JOIN public.traveler_profiles tp ON tp.id = ge.traveler_id
            LEFT JOIN public.profiles p ON p.id = tp.user_id
        ) AS alerts
        ORDER BY alerts.created_at DESC
    """

    try:
        with connection.cursor() as cursor:
            cursor.execute(sql)
            records = rows_as_dicts(cursor)

        isoformat_fields(
            records,
            ["created_at", "acknowledged_at", "resolved_at"],
        )

        return JsonResponse({
            "success": True,
            "count": len(records),
            "data": records,
        })

    except DatabaseError:
        logger.exception("Alerts query failed.")
        return error_response(
            "Could not retrieve emergency alerts.", 503
        )


# =========================================================
# UPDATE EMERGENCY ALERT STATUS
# =========================================================

@csrf_exempt
@require_POST
def update_alert_status(request, alert_id):
    try:
        alert_id = str(uuid.UUID(alert_id))
    except (ValueError, TypeError, AttributeError):
        return error_response("Invalid alert ID.")

    body, message = json_body(request)
    if message:
        return error_response(message)

    new_status = body.get("status")

    if new_status not in ("acknowledged", "resolved"):
        return error_response(
            "Status must be acknowledged or resolved."
        )

    try:
        with transaction.atomic():
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT status
                    FROM public.emergency_alerts
                    WHERE id = %s::uuid
                    FOR UPDATE
                """, [alert_id])

                existing = cursor.fetchone()
                table_name = "emergency_alerts"

                if existing is None:
                    cursor.execute("""
                        SELECT status
                        FROM public.traveler_sos_reports
                        WHERE id = %s::uuid
                        FOR UPDATE
                    """, [alert_id])
                    existing = cursor.fetchone()
                    table_name = "traveler_sos_reports"

                if existing is None:
                    cursor.execute("""
                        SELECT status
                        FROM public.geofence_entry_alerts
                        WHERE id = %s::uuid
                        FOR UPDATE
                    """, [alert_id])
                    existing = cursor.fetchone()
                    table_name = "geofence_entry_alerts"

                if existing is None:
                    return error_response("Alert not found.", 404)

                current_status = str(existing[0] or "").lower()

                if current_status in ("resolved", "closed"):
                    if new_status != "resolved":
                        return error_response(
                            "A resolved alert cannot be acknowledged again.",
                            409,
                        )

                if table_name == "emergency_alerts":
                    if new_status == "acknowledged":
                        cursor.execute("""
                            UPDATE public.emergency_alerts
                            SET status = 'acknowledged',
                                acknowledged_at =
                                    COALESCE(acknowledged_at, NOW())
                            WHERE id = %s::uuid
                            RETURNING id::text, alert_code, status,
                                      acknowledged_at, resolved_at
                        """, [alert_id])
                    else:
                        cursor.execute("""
                            UPDATE public.emergency_alerts
                            SET status = 'resolved',
                                acknowledged_at =
                                    COALESCE(acknowledged_at, NOW()),
                                resolved_at =
                                    COALESCE(resolved_at, NOW())
                            WHERE id = %s::uuid
                            RETURNING id::text, alert_code, status,
                                      acknowledged_at, resolved_at
                        """, [alert_id])
                elif table_name == "traveler_sos_reports":
                    cursor.execute("""
                        UPDATE public.traveler_sos_reports
                        SET status = %s
                        WHERE id = %s::uuid
                        RETURNING
                            id::text,
                            'SOS-' || LEFT(id::text, 8) AS alert_code,
                            status,
                            NULL::timestamptz AS acknowledged_at,
                            NULL::timestamptz AS resolved_at
                    """, [new_status, alert_id])
                else:
                    cursor.execute("""
                        UPDATE public.geofence_entry_alerts
                        SET status = %s,
                            acknowledged_at = CASE WHEN %s = 'acknowledged'
                                THEN COALESCE(acknowledged_at, NOW()) ELSE acknowledged_at END,
                            resolved_at = CASE WHEN %s = 'resolved'
                                THEN COALESCE(resolved_at, NOW()) ELSE resolved_at END
                        WHERE id = %s::uuid
                        RETURNING id::text, 'GEO-' || LEFT(id::text, 8) AS alert_code,
                                  status, acknowledged_at, resolved_at
                    """, [new_status, new_status, new_status, alert_id])

                updated = dict(zip(
                    [column[0] for column in cursor.description],
                    cursor.fetchone(),
                ))

        isoformat_fields(
            [updated], ["acknowledged_at", "resolved_at"]
        )

        return JsonResponse({
            "success": True,
            "message": "Alert status updated.",
            "data": updated,
        })

    except DatabaseError:
        logger.exception("Updating alert status failed.")
        return error_response("Could not update alert status.", 503)


# =========================================================
# GEOFENCE CONFIGURATION
# =========================================================

ZONE_COLORS = {
    "safe": "#22c55e",
    "caution": "#f59e0b",
    "restricted": "#ef4444",
    "tourist": "#3b82f6",
}

ZONE_TYPES = set(ZONE_COLORS)


def validate_geofence(body, partial=False):
    allowed = {
        "name",
        "description",
        "zone_type",
        "latitude",
        "longitude",
        "radius_meters",
        "color",
        "is_active",
    }

    unknown = set(body) - allowed

    if unknown:
        return None, (
            "Unsupported field(s): " + ", ".join(sorted(unknown))
        )

    data = dict(body)

    if not partial or "name" in data:
        name = data.get("name", "")
        if not isinstance(name, str):
            return None, "Name must be text."

        name = name.strip()

        if not name or len(name) > 120:
            return None, "Name is required and must be at most 120 characters."

        data["name"] = name

    if "description" in data:
        description = data["description"]
        if description is not None and not isinstance(description, str):
            return None, "Description must be text."
        data["description"] = description or ""

    if not partial or "zone_type" in data:
        zone_type = str(data.get("zone_type", "safe")).lower()

        if zone_type not in ZONE_TYPES:
            return None, (
                "Zone type must be safe, caution, restricted, or tourist."
            )

        data["zone_type"] = zone_type

    bounds = {
        "latitude": (-90, 90),
        "longitude": (-180, 180),
    }

    for field, (minimum, maximum) in bounds.items():
        if field not in data:
            if not partial:
                return None, f"{field} is required."
            continue

        try:
            number = Decimal(str(data[field]))
        except (InvalidOperation, ValueError, TypeError):
            return None, f"{field} must be numeric."

        if not number.is_finite() or not minimum <= number <= maximum:
            return None, (
                f"{field} must be between {minimum} and {maximum}."
            )

        data[field] = float(number)

    if "radius_meters" not in data:
        if not partial:
            return None, "radius_meters is required."
    else:
        try:
            radius = Decimal(str(data["radius_meters"]))
        except (InvalidOperation, ValueError, TypeError):
            return None, "radius_meters must be numeric."
        radius_value = float(radius) if radius.is_finite() else math.nan
        if not radius.is_finite() or not math.isfinite(radius_value) or radius <= 0:
            return None, "radius_meters must be a finite number greater than zero."
        data["radius_meters"] = radius_value

    if not partial:
        if not (
            6 <= data["latitude"] <= 37.5
            and 68 <= data["longitude"] <= 98
        ):
            return None, (
                "Coordinates must be within the configured India map bounds."
            )

    if "is_active" in data:
        value = data["is_active"]

        if isinstance(value, bool):
            pass
        elif isinstance(value, int) and value in (0, 1):
            data["is_active"] = bool(value)
        else:
            return None, "is_active must be true or false."

    if "color" in data:
        color = data["color"]

        if color is not None:
            if not isinstance(color, str):
                return None, "Color must be a hex string."

            color = color.strip()

            if color and (
                len(color) != 7
                or not color.startswith("#")
                or any(
                    char not in "0123456789abcdefABCDEF"
                    for char in color[1:]
                )
            ):
                return None, "Color must be a hex value such as #20ad7b."

            data["color"] = color or None

    return data, None


def fetch_geofence(cursor, geofence_id):
    cursor.execute("""
        SELECT
            id::text AS id,
            name,
            description,
            zone_type,
            latitude,
            longitude,
            radius_meters,
            color,
            is_active,
            created_at,
            updated_at
        FROM public.geofences
        WHERE id = %s::uuid
    """, [geofence_id])

    row = cursor.fetchone()

    if row is None:
        return None

    record = dict(zip(
        [column[0] for column in cursor.description],
        row,
    ))

    isoformat_fields([record], ["created_at", "updated_at"])
    return record


# =========================================================
# GEOFENCE API: LIST, DETAIL, CREATE, UPDATE, DELETE
# =========================================================

@csrf_exempt
def geofences_api(request, geofence_id=None):
    if request.method == "GET":
        try:
            with connection.cursor() as cursor:
                if geofence_id is not None:
                    try:
                        geofence_id = str(uuid.UUID(geofence_id))
                    except (ValueError, TypeError, AttributeError):
                        return error_response("Invalid geofence ID.")

                    record = fetch_geofence(cursor, geofence_id)

                    if record is None:
                        return error_response("Geofence not found.", 404)

                    return JsonResponse({
                        "success": True,
                        "data": record,
                    })

                cursor.execute("""
                    SELECT
                        id::text AS id,
                        name,
                        description,
                        zone_type,
                        latitude,
                        longitude,
                        radius_meters,
                        color,
                        is_active,
                        created_at,
                        updated_at
                    FROM public.geofences
                    ORDER BY created_at DESC
                """)

                records = rows_as_dicts(cursor)

            isoformat_fields(records, ["created_at", "updated_at"])

            return JsonResponse({
                "success": True,
                "count": len(records),
                "data": records,
            })

        except DatabaseError:
            logger.exception("Reading geofences failed.")
            return error_response("Could not retrieve geofences.", 503)

    if request.method == "POST":
        if geofence_id is not None:
            return error_response("Use the geofences collection URL to create.", 405)

        body, message = json_body(request)
        if message:
            return error_response(message)

        data, message = validate_geofence(body)
        if message:
            return error_response(message)

        new_id = str(uuid.uuid4())
        color = data.get("color") or ZONE_COLORS[data["zone_type"]]

        try:
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute("""
                        INSERT INTO public.geofences (
                            id, name, description, zone_type,
                            latitude, longitude, radius_meters,
                            color, is_active, created_at, updated_at
                        )
                        VALUES (
                            %s::uuid, %s, %s, %s, %s, %s, %s,
                            %s, %s, NOW(), NOW()
                        )
                    """, [
                        new_id,
                        data["name"],
                        data.get("description", ""),
                        data["zone_type"],
                        data["latitude"],
                        data["longitude"],
                        data["radius_meters"],
                        color,
                        data.get("is_active", True),
                    ])

                    record = fetch_geofence(cursor, new_id)

            return JsonResponse({
                "success": True,
                "message": "Geofence created and saved.",
                "data": record,
            }, status=201)

        except DatabaseError:
            logger.exception("Creating geofence failed.")
            return error_response("Could not save geofence.", 503)

    if request.method in ("PUT", "PATCH"):
        if geofence_id is None:
            return error_response(
                "A geofence ID is required for updating.", 400
            )

        try:
            geofence_id = str(uuid.UUID(geofence_id))
        except (ValueError, TypeError, AttributeError):
            return error_response("Invalid geofence ID.")

        body, message = json_body(request)
        if message:
            return error_response(message)

        data, message = validate_geofence(
            body, partial=(request.method == "PATCH")
        )

        if message:
            return error_response(message)

        if not data:
            return error_response("No update fields supplied.")

        # Assignments use only field names from the whitelist above.
        assignments = [f"{field} = %s" for field in data]
        params = list(data.values())

        # If the zone type changes without an explicit color, update its
        # default color to match the new type.
        if "zone_type" in data and "color" not in data:
            assignments.append("color = %s")
            params.append(ZONE_COLORS[data["zone_type"]])

        assignments.append("updated_at = NOW()")
        params.append(geofence_id)

        try:
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute(
                        "UPDATE public.geofences SET "
                        + ", ".join(assignments)
                        + " WHERE id = %s::uuid",
                        params,
                    )

                    if cursor.rowcount == 0:
                        return error_response("Geofence not found.", 404)

                    record = fetch_geofence(cursor, geofence_id)

            return JsonResponse({
                "success": True,
                "message": "Geofence updated.",
                "data": record,
            })

        except DatabaseError:
            logger.exception("Updating geofence failed.")
            return error_response("Could not update geofence.", 503)

    if request.method == "DELETE":
        if geofence_id is None:
            return error_response(
                "A geofence ID is required for deletion.", 400
            )

        try:
            geofence_id = str(uuid.UUID(geofence_id))
        except (ValueError, TypeError, AttributeError):
            return error_response("Invalid geofence ID.")

        try:
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute("""
                        DELETE FROM public.geofences
                        WHERE id = %s::uuid
                    """, [geofence_id])

                    if cursor.rowcount == 0:
                        return error_response("Geofence not found.", 404)

            return JsonResponse({
                "success": True,
                "message": "Geofence deleted.",
            })

        except DatabaseError:
            logger.exception("Deleting geofence failed.")
            return error_response("Could not delete geofence.", 503)

    return error_response("Method not allowed.", 405)


# =========================================================
# DEDICATED GEOFENCE ACTION ROUTES
# =========================================================

@csrf_exempt
def create_geofence(request):
    if request.method != "POST":
        return error_response("Only POST is allowed.", 405)

    return geofences_api(request)


@csrf_exempt
def update_geofence(request, geofence_id):
    if request.method not in ("PUT", "PATCH"):
        return error_response("Use PUT or PATCH to update a geofence.", 405)

    return geofences_api(request, geofence_id)


@csrf_exempt
def delete_geofence(request, geofence_id):
    if request.method != "DELETE":
        return error_response("Only DELETE is allowed.", 405)

    return geofences_api(request, geofence_id)


@csrf_exempt
def toggle_geofence_status(request, geofence_id):
    if request.method != "POST":
        return error_response("Only POST is allowed.", 405)

    try:
        geofence_id = str(uuid.UUID(geofence_id))
    except (ValueError, TypeError, AttributeError):
        return error_response("Invalid geofence ID.")

    body, message = json_body(request)
    if message:
        return error_response(message)

    if "is_active" in body and not isinstance(body["is_active"], bool):
        return error_response("is_active must be true or false.")

    try:
        with transaction.atomic():
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT is_active
                    FROM public.geofences
                    WHERE id = %s::uuid
                    FOR UPDATE
                """, [geofence_id])

                row = cursor.fetchone()

                if row is None:
                    return error_response("Geofence not found.", 404)

                new_status = body.get("is_active", not row[0])

                cursor.execute("""
                    UPDATE public.geofences
                    SET is_active = %s, updated_at = NOW()
                    WHERE id = %s::uuid
                """, [new_status, geofence_id])

                record = fetch_geofence(cursor, geofence_id)

        return JsonResponse({
            "success": True,
            "message": "Geofence status updated.",
            "data": record,
        })

    except DatabaseError:
        logger.exception("Toggling geofence status failed.")
        return error_response("Could not update geofence status.", 503)


# =========================================================
# AI ASSISTANT
# =========================================================

@csrf_exempt
@require_POST
def ai_assistant_chat(request):
    body, message = json_body(request)

    if message:
        return error_response(message)

    question = body.get("message", "")

    if not isinstance(question, str) or not question.strip():
        return error_response("Please enter a question.")

    question = question.strip()

    if len(question) > 4000:
        return error_response("Question is too long.")

    lower = question.lower()
    words = set(lower.split())

    if words.intersection({"hi", "hello", "hey"}):
        reply = (
            "Hello! I can help explain Travel Nexus dashboard features."
        )

    elif (
        ("how many" in lower or "count" in lower)
        and any(word in lower for word in (
            "traveler", "travellers", "travelers", "tourist"
        ))
    ):
        try:
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT COUNT(DISTINCT traveler_id)
                    FROM public.traveler_profiles
                    WHERE traveler_id IS NOT NULL
                """)
                count = cursor.fetchone()[0]

            reply = f"There are currently {count} registered travelers."

        except DatabaseError:
            logger.exception("AI traveler count query failed.")
            reply = "I couldn't retrieve the traveler count right now."

    elif "geofence" in lower or "geofencing" in lower:
        reply = (
            "Geofences are virtual zones on the map. Each saved zone "
            "has a name, type, latitude, longitude, radius, and active "
            "status. The map must fetch the geofences API to display "
            "saved zones."
        )

    elif "alert" in lower or "emergency" in lower:
        reply = (
            "The Emergency Alerts module displays reported incidents. "
            "Authorities can acknowledge an alert and mark it resolved."
        )

    elif "traveler" in lower or "tourist" in lower:
        reply = (
            "The Travelers module returns traveler profiles and the "
            "latest available journey information."
        )

    elif "monitor" in lower or "location" in lower:
        reply = (
            "Live monitoring depends on available traveler-location "
            "data and the frontend map integration."
        )

    elif "lost" in lower or "found" in lower:
        reply = (
            "The Lost and Found module stores and manages reports "
            "about lost or found items."
        )

    elif "face" in lower or "recognition" in lower:
        reply = (
            "The face-recognition endpoint currently compares test "
            "identities only. Its result is not a verified traveler identity."
        )

    elif "report" in lower:
        reply = (
            "The Reports module uses its own reports endpoint to "
            "retrieve supported report data."
        )

    else:
        reply = (
            "I can help with the dashboard, travelers, live monitoring, "
            "emergency alerts, geofences, lost and found, face recognition, "
            "and reports."
        )

    return JsonResponse({
        "success": True,
        "reply": reply,
        "message": reply,
    })


# =========================================================
# FACE RECOGNITION — TEST IDENTITIES ONLY
# =========================================================

@csrf_exempt
@require_POST
def face_recognize(request):
    deepface_dir = Path(r"D:\Travel-Nexus\deepface-master")
    python_exe = deepface_dir / ".venv-asus" / "Scripts" / "python.exe"
    recognition_script = deepface_dir / "recognize_image.py"

    identities = ["Alice", "Bob"]
    uploaded_image = request.FILES.get("image")

    if not uploaded_image:
        return error_response("No image received.", 400)

    extension = Path(uploaded_image.name).suffix.lower()
    allowed_extensions = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

    if extension not in allowed_extensions:
        return error_response(
            "Unsupported image format. Use JPG, PNG, BMP, or WEBP.",
            400,
        )

    if uploaded_image.size == 0:
        return error_response("The uploaded image is empty.", 400)

    if uploaded_image.size > 8 * 1024 * 1024:
        return error_response("Image size must be 8 MB or less.", 400)

    if not python_exe.is_file():
        logger.error("Python environment not found: %s", python_exe)
        return error_response("DeepFace Python environment not found.", 500)

    if not recognition_script.is_file():
        logger.error("Recognition script not found: %s", recognition_script)
        return error_response("recognize_image.py was not found.", 500)

    temp_path = None

    try:
        with tempfile.NamedTemporaryFile(
            mode="wb",
            suffix=extension,
            prefix="travel_nexus_face_",
            delete=False,
        ) as temp_file:
            temp_path = Path(temp_file.name)

            for chunk in uploaded_image.chunks():
                temp_file.write(chunk)

        candidates = []

        for identity in identities:
            try:
                completed = subprocess.run(
                    [
                        str(python_exe),
                        str(recognition_script),
                        str(temp_path),
                        identity,
                    ],
                    capture_output=True,
                    text=True,
                    timeout=180,
                    check=False,
                    cwd=str(deepface_dir),
                )
            except subprocess.TimeoutExpired:
                logger.exception("Face recognition timed out.")
                return error_response(
                    "Face recognition timed out. Please try again.",
                    504,
                )

            result_line = next(
                (
                    line[len("TN_RESULT:"):]
                    for line in reversed(completed.stdout.splitlines())
                    if line.startswith("TN_RESULT:")
                ),
                None,
            )

            if result_line is None:
                logger.error(
                    "No result for %s. Exit=%s; stderr=%s",
                    identity,
                    completed.returncode,
                    completed.stderr[-2000:],
                )
                return error_response(
                    "Recognition returned no valid result. "
                    "Check the backend terminal.",
                    502,
                )

            try:
                result = json.loads(result_line)
            except json.JSONDecodeError:
                return error_response(
                    "Recognition returned invalid JSON.",
                    502,
                )

            if completed.returncode != 0 or not result.get("success"):
                logger.warning(
                    "Comparison failed for %s: %s",
                    identity,
                    result.get("message"),
                )

                if result.get("face_detected") is False:
                    continue

                return JsonResponse({
                    "success": True,
                    "face_detected": result.get("face_detected"),
                    "comparison_status": "review_required",
                    "distance": None,
                    "traveler_id": None,
                    "test_identity": None,
                    "closest_test_candidate": None,
                    "test_only": True,
                    "message": (
                        "The face could not be reliably evaluated. "
                        "Please capture another clear image."
                    ),
                })

            if not result.get("face_detected", False):
                continue

            try:
                distance = float(result["distance"])
                threshold = float(result["threshold"])

                if (
                    not math.isfinite(distance)
                    or not math.isfinite(threshold)
                    or distance < 0
                    or threshold <= 0
                ):
                    raise ValueError("Invalid distance or threshold.")

            except (KeyError, TypeError, ValueError):
                logger.warning(
                    "Invalid comparison values for %s.", identity
                )
                continue

            matched = (
                result.get("comparison_status") == "matched"
                and distance <= threshold
            )

            candidates.append({
                "identity": identity,
                "distance": distance,
                "threshold": threshold,
                "matched": matched,
            })

        if not candidates:
            return JsonResponse({
                "success": True,
                "face_detected": False,
                "comparison_status": "review_required",
                "distance": None,
                "traveler_id": None,
                "test_identity": None,
                "closest_test_candidate": None,
                "test_only": True,
                "message": (
                    "No usable face comparison was available. "
                    "Try another clear, front-facing photo."
                ),
            })

        matched_candidates = [
            candidate for candidate in candidates
            if candidate["matched"]
        ]

        if not matched_candidates:
            closest = min(
                candidates,
                key=lambda candidate: candidate["distance"],
            )

            return JsonResponse({
                "success": True,
                "face_detected": True,
                "comparison_status": "unknown",
                "distance": closest["distance"],
                "traveler_id": None,
                "test_identity": None,
                "closest_test_candidate": closest["identity"],
                "test_only": True,
                "message": "Unknown person — no verified match found.",
            })

        best = min(
            matched_candidates,
            key=lambda candidate: candidate["distance"],
        )

        other_matches = [
            candidate for candidate in matched_candidates
            if candidate["identity"] != best["identity"]
        ]

        if other_matches:
            second_best = min(
                other_matches,
                key=lambda candidate: candidate["distance"],
            )

            if second_best["distance"] - best["distance"] < 0.08:
                return JsonResponse({
                    "success": True,
                    "face_detected": True,
                    "comparison_status": "review_required",
                    "distance": best["distance"],
                    "traveler_id": None,
                    "test_identity": None,
                    "closest_test_candidate": best["identity"],
                    "test_only": True,
                    "message": (
                        "Ambiguous face comparison. "
                        "Identity requires manual review."
                    ),
                })

        return JsonResponse({
            "success": True,
            "face_detected": True,
            "comparison_status": "matched",
            "distance": best["distance"],
            "traveler_id": None,
            "test_identity": best["identity"],
            "closest_test_candidate": best["identity"],
            "test_only": True,
            "message": f"Matched test identity: {best['identity']}.",
        })

    except Exception:
        logger.exception("Unexpected Face Recognition API error.")
        return error_response(
            "An unexpected error occurred during face recognition.",
            500,
        )

    finally:
        if temp_path is not None:
            try:
                temp_path.unlink(missing_ok=True)
            except OSError:
                logger.warning(
                    "Could not remove temporary image: %s",
                    temp_path,
                )
