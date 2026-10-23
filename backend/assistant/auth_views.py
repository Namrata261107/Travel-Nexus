import json
import logging
import math
import threading
import urllib.error
import urllib.request
import uuid
from django.conf import settings
from django.db import DatabaseError, OperationalError, connection, transaction
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST
from .sms_gateway import send_geofence_entry_sms

logger = logging.getLogger(__name__)


def _json_body(request):
    try:
        body = json.loads(request.body or b"{}")
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None
    return body if isinstance(body, dict) else None


def _verified_user(request):
    authorization = request.headers.get("Authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None, JsonResponse(
            {"success": False, "message": "A valid sign-in is required."},
            status=401,
        )

    if not settings.SUPABASE_URL or not settings.SUPABASE_PUBLISHABLE_KEY:
        return None, JsonResponse(
            {"success": False, "message": "Supabase authentication is not configured."},
            status=503,
        )

    verification_request = urllib.request.Request(
        f"{settings.SUPABASE_URL}/auth/v1/user",
        headers={
            "apikey": settings.SUPABASE_PUBLISHABLE_KEY,
            "Authorization": f"Bearer {token}",
        },
    )
    try:
        with urllib.request.urlopen(verification_request, timeout=8) as response:
            user = json.loads(response.read())
    except urllib.error.HTTPError as error:
        if error.code in (400, 401, 403):
            return None, JsonResponse(
                {"success": False, "message": "Your sign-in has expired. Please sign in again."},
                status=401,
            )
        logger.warning("Supabase user verification returned HTTP %s.", error.code)
        return None, JsonResponse(
            {"success": False, "message": "Could not verify the sign-in with Supabase."},
            status=503,
        )
    except (
        urllib.error.URLError,
        TimeoutError,
        json.JSONDecodeError,
        UnicodeDecodeError,
    ):
        logger.exception("Supabase user verification failed.")
        return None, JsonResponse(
            {"success": False, "message": "Could not verify the sign-in with Supabase."},
            status=503,
        )

    if not isinstance(user, dict) or not user.get("id"):
        return None, JsonResponse(
            {"success": False, "message": "Supabase returned an invalid user."},
            status=401,
        )

    try:
        user["id"] = uuid.UUID(str(user["id"]))
    except (ValueError, TypeError, AttributeError):
        return None, JsonResponse(
            {"success": False, "message": "Supabase returned an invalid user ID."},
            status=401,
        )
    return user, None


def _new_registration_role(user):
    metadata = user.get("user_metadata")
    if not isinstance(metadata, dict):
        return "traveler"

    requested_role = str(metadata.get("requested_role", "")).strip().lower()
    return requested_role if requested_role in ("traveler", "authority") else "traveler"


def _ensure_user_profile(user):
    user_id = user["id"]
    metadata = user.get("user_metadata")
    metadata = metadata if isinstance(metadata, dict) else {}
    email = str(user.get("email") or "")[:320] or None
    name = str(metadata.get("full_name") or "").strip()[:100]
    phone = str(metadata.get("phone") or "").strip()[:32] or None

    with transaction.atomic():
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT full_name, role, phone FROM public.profiles WHERE id = %s FOR UPDATE",
                [user_id],
            )
            existing = cursor.fetchone()

            if existing:
                full_name, role, existing_phone = existing
                cursor.execute(
                    """
                    UPDATE public.profiles
                    SET email = %s, updated_at = NOW()
                    WHERE id = %s
                    """,
                    [email, user_id],
                )
                phone = existing_phone
            else:
                full_name = name or (email.split("@", 1)[0] if email else "Travel Nexus User")
                role = _new_registration_role(user)
                cursor.execute(
                    """
                    INSERT INTO public.profiles (id, full_name, email, role, phone)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    [user_id, full_name, email, role, phone],
                )

            traveler_profile_id = None
            traveler_id = None
            authority_id = None
            if role == "traveler":
                generated_traveler_id = f"TRV-{uuid.uuid4().hex[:10].upper()}"
                cursor.execute(
                    """
                    INSERT INTO public.traveler_profiles (user_id, traveler_id)
                    VALUES (%s, %s)
                    ON CONFLICT (user_id) DO NOTHING
                    """,
                    [user_id, generated_traveler_id],
                )
                cursor.execute(
                    """
                    SELECT id, traveler_id
                    FROM public.traveler_profiles
                    WHERE user_id = %s
                    """,
                    [user_id],
                )
                traveler_profile_id, traveler_id = cursor.fetchone()
            elif role in ("authority", "admin"):
                generated_authority_id = f"AUTH-{uuid.uuid4().hex[:10].upper()}"
                cursor.execute(
                    """
                    INSERT INTO public.authority_users (user_id, authority_id)
                    VALUES (%s, %s)
                    ON CONFLICT (user_id) DO NOTHING
                    """,
                    [user_id, generated_authority_id],
                )
                cursor.execute(
                    """
                    SELECT authority_id
                    FROM public.authority_users
                    WHERE user_id = %s
                    """,
                    [user_id],
                )
                row = cursor.fetchone()
                authority_id = row[0] if row else None

    return {
        "id": str(user_id),
        "full_name": full_name,
        "email": email,
        "phone": phone,
        "role": role,
        "traveler_profile_id": str(traveler_profile_id) if traveler_profile_id else None,
        "traveler_id": traveler_id,
        "authority_id": authority_id,
    }


@csrf_exempt
@require_POST
def auth_bootstrap(request):
    if _json_body(request) is None:
        return JsonResponse(
            {"success": False, "message": "Request body must be a JSON object."},
            status=400,
        )

    user, error_response = _verified_user(request)
    if error_response:
        return error_response

    try:
        profile = _ensure_user_profile(user)
    except OperationalError:
        logger.exception("Database connection unavailable during account bootstrap.")
        return JsonResponse(
            {
                "success": False,
                "message": (
                    "The account database is temporarily busy. "
                    "Please try signing in again in a moment."
                ),
            },
            status=503,
        )
    except DatabaseError:
        logger.exception("Could not create or retrieve the authenticated user profile.")
        return JsonResponse(
            {"success": False, "message": "Could not load your Travel Nexus profile."},
            status=503,
        )

    return JsonResponse({"success": True, "profile": profile})


def _optional_number(body, key, minimum=None, maximum=None):
    value = body.get(key)
    if value is None:
        return None
    if isinstance(value, bool):
        raise ValueError
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise ValueError from None
    if not math.isfinite(number):
        raise ValueError
    if minimum is not None and number < minimum:
        raise ValueError
    if maximum is not None and number > maximum:
        raise ValueError
    return number


@csrf_exempt
@require_POST
def traveler_location(request):
    body = _json_body(request)
    if body is None:
        return JsonResponse(
            {"success": False, "message": "Request body must be a JSON object."},
            status=400,
        )

    user, error_response = _verified_user(request)
    if error_response:
        return error_response

    try:
        latitude = _optional_number(body, "latitude", -90, 90)
        longitude = _optional_number(body, "longitude", -180, 180)
        accuracy = _optional_number(body, "accuracy", 0, 1_000_000)
        altitude = _optional_number(body, "altitude")
        speed = _optional_number(body, "speed", 0, 1_000)
    except ValueError:
        return JsonResponse(
            {"success": False, "message": "Location coordinates or accuracy are invalid."},
            status=400,
        )

    if latitude is None or longitude is None:
        return JsonResponse(
            {"success": False, "message": "Latitude and longitude are required."},
            status=400,
        )

    try:
        sms_events = []
        with transaction.atomic(), connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT p.role, tp.id, p.phone, p.full_name
                FROM public.profiles p
                LEFT JOIN public.traveler_profiles tp ON tp.user_id = p.id
                WHERE p.id = %s
                """,
                [user["id"]],
            )
            profile = cursor.fetchone()

            if not profile or profile[0] != "traveler" or not profile[1]:
                return JsonResponse(
                    {"success": False, "message": "Only traveler accounts can share location."},
                    status=403,
                )

            cursor.execute(
                """
                INSERT INTO public.traveler_locations (
                    traveler_id, latitude, longitude,
                    accuracy, altitude, speed, recorded_at
                )
                VALUES (
                    %s, %s, %s, %s, %s, %s, NOW()
                )
                RETURNING recorded_at
                """,
                [
                    profile[1],
                    latitude,
                    longitude,
                    accuracy,
                    altitude,
                    speed,
                ],
            )
            recorded_at = cursor.fetchone()[0]

            cursor.execute("""
                SELECT id, name, zone_type, latitude, longitude, radius_meters
                FROM public.geofences
                WHERE is_active = TRUE
            """)
            zones = cursor.fetchall()
            cursor.execute("""
                UPDATE public.geofence_entry_states state
                SET is_inside = FALSE, updated_at = NOW()
                WHERE state.traveler_id = %s
                  AND NOT EXISTS (
                      SELECT 1 FROM public.geofences zone
                      WHERE zone.id = state.geofence_id AND zone.is_active = TRUE
                  )
            """, [profile[1]])
            for zone_id, zone_name, zone_type, zone_lat, zone_lng, radius in zones:
                earth_radius = 6371000.0
                lat1, lat2 = math.radians(latitude), math.radians(float(zone_lat))
                dlat = lat2 - lat1
                dlng = math.radians(float(zone_lng) - longitude)
                haversine = (
                    math.sin(dlat / 2) ** 2
                    + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
                )
                distance = earth_radius * 2 * math.atan2(
                    math.sqrt(haversine), math.sqrt(max(0.0, 1.0 - haversine))
                )
                is_inside = distance <= float(radius)

                cursor.execute("""
                    SELECT is_inside
                    FROM public.geofence_entry_states
                    WHERE traveler_id = %s AND geofence_id = %s
                    FOR UPDATE
                """, [profile[1], zone_id])
                state = cursor.fetchone()
                entered = is_inside and (state is None or not state[0])

                if state is None:
                    cursor.execute("""
                        INSERT INTO public.geofence_entry_states
                            (traveler_id, geofence_id, is_inside, updated_at)
                        VALUES (%s, %s, %s, NOW())
                        ON CONFLICT (traveler_id, geofence_id) DO UPDATE
                        SET is_inside = EXCLUDED.is_inside, updated_at = NOW()
                    """, [profile[1], zone_id, is_inside])
                else:
                    cursor.execute("""
                        UPDATE public.geofence_entry_states
                        SET is_inside = %s, updated_at = NOW()
                        WHERE traveler_id = %s AND geofence_id = %s
                    """, [is_inside, profile[1], zone_id])

                if entered:
                    cursor.execute("""
                        INSERT INTO public.geofence_entry_alerts (
                            traveler_id, geofence_id, latitude, longitude
                        ) VALUES (%s, %s, %s, %s)
                    """, [profile[1], zone_id, latitude, longitude])
                    sms_events.append((profile[2], profile[3], zone_name, zone_type))
    except DatabaseError:
        logger.exception("Could not save a traveler location.")
        return JsonResponse(
            {"success": False, "message": "Could not save your location."},
            status=503,
        )

    for phone, traveler_name, zone_name, zone_type in sms_events:
        threading.Thread(
            target=send_geofence_entry_sms,
            args=(phone, traveler_name, zone_name, zone_type),
            daemon=True,
            name="geofence-entry-sms",
        ).start()

    return JsonResponse({
        "success": True,
        "recorded_at": recorded_at.isoformat(),
    })


@require_GET
def traveler_geofence_alerts(request):
    user, error_response = _verified_user(request)
    if error_response:
        return error_response

    try:
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT tp.id
                FROM public.profiles p
                JOIN public.traveler_profiles tp ON tp.user_id = p.id
                WHERE p.id = %s AND p.role = 'traveler'
            """, [user["id"]])
            profile = cursor.fetchone()
            if not profile:
                return JsonResponse(
                    {"success": False, "message": "Only traveler accounts can view these notifications."},
                    status=403,
                )

            cursor.execute("""
                SELECT ge.id::text, g.name, g.zone_type,
                       ge.latitude, ge.longitude, ge.status, ge.created_at
                FROM public.geofence_entry_alerts ge
                JOIN public.geofences g ON g.id = ge.geofence_id
                WHERE ge.traveler_id = %s
                ORDER BY ge.created_at DESC
                LIMIT 50
            """, [profile[0]])
            records = [dict(zip(
                [column[0] for column in cursor.description], row
            )) for row in cursor.fetchall()]

        for record in records:
            if record["created_at"]:
                record["created_at"] = record["created_at"].isoformat()
            record["alert_type"] = "geofence_entry"
            zone_name = record.pop("name")
            zone_type = str(record.pop("zone_type")).replace("_", " ")
            record["title"] = f"You entered a {zone_type} zone: {zone_name}"
            record["description"] = (
                f"The Authority has been notified that you entered the {zone_type} zone."
            )
        return JsonResponse({"success": True, "count": len(records), "data": records})
    except DatabaseError:
        logger.exception("Could not retrieve traveler geofence notifications.")
        return JsonResponse(
            {"success": False, "message": "Could not retrieve your notifications."},
            status=503,
        )


@csrf_exempt
@require_POST
def traveler_sos(request):
    body = _json_body(request)
    if body is None:
        return JsonResponse(
            {"success": False, "message": "Request body must be a JSON object."},
            status=400,
        )

    user, error_response = _verified_user(request)
    if error_response:
        return error_response

    try:
        latitude = _optional_number(body, "latitude", -90, 90)
        longitude = _optional_number(body, "longitude", -180, 180)
    except ValueError:
        return JsonResponse(
            {"success": False, "message": "Location coordinates are invalid."},
            status=400,
        )

    if (latitude is None) != (longitude is None):
        return JsonResponse(
            {"success": False, "message": "Latitude and longitude must be provided together."},
            status=400,
        )

    try:
        with transaction.atomic():
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT p.role, p.full_name, tp.traveler_id
                    FROM public.profiles p
                    LEFT JOIN public.traveler_profiles tp ON tp.user_id = p.id
                    WHERE p.id = %s
                    """,
                    [user["id"]],
                )
                profile = cursor.fetchone()

                if not profile or profile[0] != "traveler" or not profile[2]:
                    return JsonResponse(
                        {"success": False, "message": "Only traveler accounts can create an SOS alert."},
                        status=403,
                    )

                area_name = (
                    f"Coordinates {latitude:.6f}, {longitude:.6f}"
                    if latitude is not None
                    else "Location unavailable"
                )
                cursor.execute(
                    """
                    INSERT INTO public.traveler_sos_reports (
                        traveler_name, traveler_code, latitude, longitude,
                        area_name, message, status
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, 'created')
                    RETURNING id::text, created_at
                    """,
                    [
                        profile[1] or "Traveler",
                        profile[2],
                        latitude,
                        longitude,
                        area_name,
                        "Emergency assistance requested by the traveler.",
                    ],
                )
                report_id, created_at = cursor.fetchone()
    except DatabaseError:
        logger.exception("Could not create a traveler SOS alert.")
        return JsonResponse(
            {"success": False, "message": "Could not create your SOS alert. Please try again."},
            status=503,
        )

    return JsonResponse({
        "success": True,
        "message": "Your SOS alert was sent to the Authority dashboard.",
        "data": {
            "id": report_id,
            "alert_code": f"SOS-{report_id[:8]}",
            "created_at": created_at.isoformat(),
            "traveler_name": profile[1] or "Traveler",
            "traveler_id": profile[2],
            "latitude": latitude,
            "longitude": longitude,
            "area_name": area_name,
            "status": "created",
        },
    }, status=201)
