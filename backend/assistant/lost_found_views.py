import json
import logging
import uuid
from datetime import date

from django.db import DatabaseError, connection, transaction
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

from .auth_views import _verified_user

logger = logging.getLogger(__name__)


def _body(request):
    try:
        data = json.loads(request.body or b"{}")
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None
    return data if isinstance(data, dict) else None


def _actor(user):
    with connection.cursor() as cursor:
        cursor.execute("""
            SELECT p.id, p.full_name, p.email, p.role,
                   tp.id, tp.traveler_id
            FROM public.profiles p
            LEFT JOIN public.traveler_profiles tp ON tp.user_id = p.id
            WHERE p.id = %s
        """, [user["id"]])
        row = cursor.fetchone()
    if not row or row[3] not in ("traveler", "authority", "admin"):
        return None
    return {
        "id": row[0],
        "name": row[1] or (row[2].split("@", 1)[0] if row[2] else "Travel Nexus user"),
        "role": "authority" if row[3] == "admin" else row[3],
        "traveler_profile_id": row[4],
        "traveler_code": row[5],
    }


def _payload(data, *, partial=False):
    fields = {}
    text_limits = {
        "item_name": 100,
        "item_type": 80,
        "location_description": 150,
        "description": 500,
        "reporter_contact": 100,
    }
    for key, limit in text_limits.items():
        if partial and key not in data:
            continue
        value = data.get(key)
        value = str(value or "").strip()
        if key in ("item_name", "item_type", "location_description") and not value:
            raise ValueError(f"{key.replace('_', ' ').capitalize()} is required.")
        if len(value) > limit:
            raise ValueError(f"{key.replace('_', ' ').capitalize()} must be {limit} characters or fewer.")
        fields[key] = value or None

    if "item_type" in fields:
        category = str(fields["item_type"] or "").strip()
        if category.lower() not in {"electronics", "bags", "documents", "accessories", "clothing", "other"}:
            raise ValueError("Choose a valid item category.")

    if partial and "report_type" not in data:
        pass
    elif "report_type" in data:
        report_type = str(data.get("report_type") or "").strip().lower()
        if report_type not in ("lost", "found"):
            raise ValueError("Report type must be Lost or Found.")
        fields["report_type"] = report_type
    elif not partial:
        raise ValueError("Report type is required.")

    if partial and "status" not in data:
        pass
    else:
        status = str(data.get("status") or "pending").strip().lower().replace(" ", "_")
        status = {
            "open": "pending",
            "pending": "pending",
            # The database's canonical value for an in-progress/matched
            # report is "matched" (its CHECK constraint rejects
            # "in_progress").
            "in_progress": "matched",
            "matched": "matched",
            "verified": "verified",
            "returned": "returned",
            "resolved": "resolved",
            "cancelled": "cancelled",
        }.get(status)
        if not status:
            raise ValueError("Choose a valid report status.")
        fields["status"] = status

    if partial and "report_date" not in data:
        pass
    else:
        value = str(data.get("report_date") or "").strip()
        try:
            fields["report_date"] = date.fromisoformat(value) if value else date.today()
        except ValueError:
            raise ValueError("Report date must be a valid date.") from None

    return fields


def _records(cursor):
    columns = [item[0] for item in cursor.description]
    result = []
    for row in cursor.fetchall():
        record = dict(zip(columns, row))
        if record.get("report_date"):
            record["report_date"] = record["report_date"].isoformat()
        if record.get("created_at"):
            record["created_at"] = record["created_at"].isoformat()
        result.append(record)
    return result


def _access(request):
    user, error = _verified_user(request)
    if error:
        return None, error
    try:
        actor = _actor(user)
    except DatabaseError:
        logger.exception("Could not load Lost & Found account profile.")
        return None, JsonResponse({"success": False, "message": "Could not verify your account."}, status=503)
    if not actor:
        return None, JsonResponse({"success": False, "message": "A registered traveler or authority account is required."}, status=403)
    return actor, None


@csrf_exempt
def lost_found_reports(request):
    actor, error = _access(request)
    if error:
        return error

    if request.method == "GET":
        try:
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT r.id::text AS id, r.report_code, r.item_name,
                           r.item_type, r.description, r.location_description,
                           r.report_type, r.status, r.image_url,
                           r.latitude, r.longitude,
                           COALESCE(NULLIF(p.full_name, ''), p.email, 'Travel Nexus user') AS reporter_name,
                           r.reporter_contact,
                           COALESCE(r.report_date, r.created_at::date) AS report_date,
                           r.created_at, r.reported_by::text AS reported_by
                    FROM public.lost_found_reports r
                    LEFT JOIN public.traveler_profiles tp ON tp.id = r.traveler_id
                    LEFT JOIN public.profiles p ON p.id = COALESCE(r.reported_by, tp.user_id)
                    ORDER BY r.created_at DESC
                    LIMIT 500
                """)
                records = _records(cursor)
            return JsonResponse({"success": True, "count": len(records), "data": records})
        except DatabaseError:
            logger.exception("Could not list Lost & Found reports.")
            return JsonResponse({"success": False, "message": "Could not load Lost & Found reports."}, status=503)

    if request.method != "POST":
        return JsonResponse({"success": False, "message": "Only GET and POST are allowed."}, status=405)

    data = _body(request)
    if data is None:
        return JsonResponse({"success": False, "message": "Request body must be a JSON object."}, status=400)
    try:
        fields = _payload(data)
    except ValueError as exc:
        return JsonResponse({"success": False, "message": str(exc)}, status=400)

    report_uuid = uuid.uuid4()
    report_code = f"TN-{actor['role'].upper()}-{report_uuid.hex[:10].upper()}"
    traveler_id = actor["traveler_profile_id"] if actor["role"] == "traveler" else None
    try:
        with transaction.atomic(), connection.cursor() as cursor:
            cursor.execute("""
                INSERT INTO public.lost_found_reports (
                    report_code, traveler_id, reported_by, item_type,
                    item_name, description, location_description,
                    report_type, status, reporter_contact, report_date
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id::text, report_code
            """, [
                report_code, traveler_id, actor["id"], fields["item_type"],
                fields["item_name"], fields.get("description"),
                fields["location_description"], fields["report_type"],
                fields["status"], fields.get("reporter_contact"),
                fields["report_date"],
            ])
            report_id, saved_code = cursor.fetchone()
        return JsonResponse({"success": True, "id": report_id, "report_code": saved_code}, status=201)
    except DatabaseError:
        logger.exception("Could not save a Lost & Found report.")
        return JsonResponse({"success": False, "message": "Could not save the report to the database."}, status=503)


@csrf_exempt
def lost_found_report_detail(request, report_id):
    actor, error = _access(request)
    if error:
        return error

    if request.method not in ("PATCH", "DELETE"):
        return JsonResponse({"success": False, "message": "Only PATCH and DELETE are allowed."}, status=405)

    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT reported_by FROM public.lost_found_reports WHERE id = %s", [report_id])
            row = cursor.fetchone()
        if not row:
            return JsonResponse({"success": False, "message": "Report not found."}, status=404)
        if actor["role"] != "authority" and row[0] != actor["id"]:
            return JsonResponse({"success": False, "message": "You can only change reports you submitted."}, status=403)

        if request.method == "DELETE":
            with connection.cursor() as cursor:
                cursor.execute("DELETE FROM public.lost_found_reports WHERE id = %s", [report_id])
            return JsonResponse({"success": True})

        data = _body(request)
        if data is None:
            return JsonResponse({"success": False, "message": "Request body must be a JSON object."}, status=400)
        fields = _payload(data, partial=True)
        if not fields:
            return JsonResponse({"success": False, "message": "No report changes were supplied."}, status=400)
        assignments = ", ".join(f"{column} = %s" for column in fields)
        with transaction.atomic(), connection.cursor() as cursor:
            cursor.execute(
                f"UPDATE public.lost_found_reports SET {assignments} WHERE id = %s",
                [*fields.values(), report_id],
            )
        return JsonResponse({"success": True})
    except ValueError as exc:
        return JsonResponse({"success": False, "message": str(exc)}, status=400)
    except DatabaseError:
        logger.exception("Could not update a Lost & Found report.")
        return JsonResponse({"success": False, "message": "Could not update the report."}, status=503)
