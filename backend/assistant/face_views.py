import json
import logging
import time
import urllib.error
import urllib.request
import uuid
from io import BytesIO

from django.conf import settings
from django.db import connection
from django.http import FileResponse, JsonResponse
from django.urls import reverse
from django.views.decorators.csrf import csrf_exempt
from PIL import Image, UnidentifiedImageError

from .models import FaceCase, FaceDetection
from .auth_views import _verified_user

logger = logging.getLogger(__name__)
FACE_SERVICE_URL = getattr(
    settings, "FACE_RECOGNITION_SERVICE_URL", "http://127.0.0.1:8001"
).rstrip("/")
FACE_SERVICE_API_KEY = getattr(settings, "FACE_SERVICE_API_KEY", "")
MAX_IMAGE_BYTES = 8 * 1024 * 1024
MATCH_CONFIRMATION_SECONDS = 2.5
DETECTION_COOLDOWN_SECONDS = 45
active_match_since = {}
last_detection_at = {}


def face_access_required(request, allowed_roles=("authority", "admin")):
    user, error_response = _verified_user(request)
    if error_response:
        return error_response

    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT role FROM public.profiles WHERE id = %s", [user["id"]])
            profile = cursor.fetchone()
    except Exception:
        logger.exception("Could not verify the face-report user's role.")
        return JsonResponse({
            "success": False,
            "error": "Could not verify your authority permissions.",
        }, status=503)

    role = str(profile[0]).lower() if profile else ""
    if role not in allowed_roles:
        return JsonResponse({
            "success": False,
            "error": "This action is available to authorized authority accounts only.",
        }, status=403)

    request.face_user_id = str(user["id"])
    return None


def face_service_headers(boundary):
    if not FACE_SERVICE_API_KEY and not settings.DEBUG:
        raise RuntimeError("Face recognition service authentication is not configured.")
    headers = {"Content-Type": f"multipart/form-data; boundary={boundary}"}
    if FACE_SERVICE_API_KEY:
        headers["X-Face-Service-Key"] = FACE_SERVICE_API_KEY
    return headers


def validate_image(upload):
    if not upload:
        return "A photo is required."
    if upload.size == 0 or upload.size > MAX_IMAGE_BYTES:
        return "Photo must be non-empty and 8 MB or smaller."
    try:
        with Image.open(upload) as image:
            image_format = image.format
            if image_format not in {"JPEG", "PNG", "WEBP"}:
                return "Use a JPEG, PNG, or WEBP photo."
            image.verify()
        upload.content_type = {
            "JPEG": "image/jpeg",
            "PNG": "image/png",
            "WEBP": "image/webp",
        }[image_format]
    except (UnidentifiedImageError, OSError, ValueError):
        return "The uploaded file is not a supported image."
    finally:
        upload.seek(0)
    return None


def serialize_case(request, report):
    return {
        "id": report.id,
        "name": report.name,
        "report_type": report.case_type,
        "report_type_label": report.get_case_type_display(),
        "description": report.details,
        "reference_photo": request.build_absolute_uri(
            reverse("face-case-photo", args=[report.pk])
        ),
        "is_active": report.is_active,
        "created_at": report.created_at.isoformat(),
    }


def serialize_detection(request, detection):
    report = detection.case
    return {
        "id": detection.id,
        "report_id": report.id,
        "name": report.name,
        "report_type": report.case_type,
        "report_type_label": report.get_case_type_display(),
        "description": report.details,
        "reference_photo": request.build_absolute_uri(
            reverse("face-case-photo", args=[report.pk])
        ),
        "captured_photo": request.build_absolute_uri(
            reverse("face-detection-photo", args=[detection.pk])
        ),
        "similarity_score": detection.confidence,
        "latitude": detection.latitude,
        "longitude": detection.longitude,
        "reviewed": detection.review_status != "pending_review",
        "captured_at": detection.detected_at.isoformat(),
    }


def multipart_field(boundary, name, value):
    return (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="{name}"\r\n\r\n'
    ).encode() + str(value).encode("utf-8") + b"\r\n"


def multipart_file(boundary, name, filename, content, content_type):
    return (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'
        f"Content-Type: {content_type}\r\n\r\n"
    ).encode() + content + b"\r\n"


def post_multipart(url, fields, files, timeout=90):
    boundary = uuid.uuid4().hex
    parts = [
        multipart_field(boundary, name, value)
        for name, value in fields.items()
    ]
    parts.extend(
        multipart_file(boundary, name, filename, content, content_type)
        for name, filename, content, content_type in files
    )
    parts.append(f"--{boundary}--\r\n".encode())
    request = urllib.request.Request(
        url,
        data=b"".join(parts),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


@csrf_exempt
def face_cases(request):
    roles = ("traveler", "authority", "admin") if request.method == "GET" else ("authority", "admin")
    denied = face_access_required(request, roles)
    if denied:
        return denied

    if request.method == "GET":
        reports = FaceCase.objects.filter(is_active=True)
        return JsonResponse({
            "success": True,
            "cases": [serialize_case(request, report) for report in reports],
        })

    if request.method != "POST":
        return JsonResponse(
            {"success": False, "error": "Method not allowed."},
            status=405,
        )

    name = request.POST.get("name", "").strip()
    report_type = request.POST.get("report_type", "").strip()
    description = request.POST.get("description", "").strip()
    photo = request.FILES.get("photo")

    if not name or len(name) > 120:
        return JsonResponse({
            "success": False,
            "error": "Enter a name between 1 and 120 characters.",
        }, status=400)
    if report_type not in FaceCase.CaseType.values:
        return JsonResponse({
            "success": False,
            "error": "Choose suspicious, missing child, or missing person.",
        }, status=400)
    if len(description) > 1000:
        return JsonResponse({
            "success": False,
            "error": "Description must be 1,000 characters or fewer.",
        }, status=400)

    image_error = validate_image(photo)
    if image_error:
        return JsonResponse({"success": False, "error": image_error}, status=400)

    report = FaceCase.objects.create(
        name=name,
        case_type=report_type,
        details=description,
        photo=photo.read(),
        photo_name=photo.name[:255],
        photo_content_type=photo.content_type or "application/octet-stream",
        created_by=None,
    )
    return JsonResponse({
        "success": True,
        "case": serialize_case(request, report),
        "message": "Report saved. Its reference photo will be prepared when recognition starts.",
    }, status=201)


@csrf_exempt
def prepare_face_recognition(request):
    denied = face_access_required(request)
    if denied:
        return denied
    if not FACE_SERVICE_API_KEY and not settings.DEBUG:
        return JsonResponse({
            "success": False,
            "error": "Face recognition service authentication is not configured.",
        }, status=503)
    if request.method != "POST":
        return JsonResponse(
            {"success": False, "error": "Method not allowed."},
            status=405,
        )

    reports = list(FaceCase.objects.filter(is_active=True))
    boundary = uuid.uuid4().hex
    parts = [multipart_field(boundary, "reports", json.dumps([
        {
            "id": report.id,
            "name": report.name,
            "report_type": report.case_type,
        }
        for report in reports
    ]))]

    for index, report in enumerate(reports):
        try:
            content = bytes(report.photo)
        except (TypeError, ValueError):
            logger.exception("Could not read face report reference photo %s.", report.id)
            return JsonResponse({
                "success": False,
                "error": f"Could not read the reference photo for {report.name}.",
            }, status=503)
        if not content or len(content) > MAX_IMAGE_BYTES:
            return JsonResponse({
                "success": False,
                "error": f"The reference photo for {report.name} is empty or exceeds 8 MB.",
            }, status=400)
        parts.append(multipart_file(
            boundary,
            f"reference_{index}",
            report.photo_name.rsplit("/", 1)[-1],
            content,
            report.photo_content_type,
        ))

    parts.append(f"--{boundary}--\r\n".encode())
    service_request = urllib.request.Request(
        f"{FACE_SERVICE_URL}/sync",
        data=b"".join(parts),
        headers=face_service_headers(boundary),
        method="POST",
    )
    try:
        with urllib.request.urlopen(service_request, timeout=300) as response:
            result = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        logger.exception("Face recognition service could not prepare reference photos.")
        return JsonResponse({
            "success": False,
            "error": "Face recognition service is unavailable. Check its deployment and try again.",
        }, status=503)

    if not result.get("success"):
        return JsonResponse({
            "success": False,
            "error": result.get("error", "Could not prepare face recognition."),
        }, status=503)
    return JsonResponse({
        "success": True,
        "registered_cases": result.get("registered_cases", 0),
        "rejected_cases": result.get("rejected_cases", []),
    })


@csrf_exempt
def face_recognition_scan(request):
    denied = face_access_required(request)
    if denied:
        return denied
    if not FACE_SERVICE_API_KEY and not settings.DEBUG:
        return JsonResponse({
            "success": False,
            "error": "Face recognition service authentication is not configured.",
        }, status=503)
    if request.method != "POST":
        return JsonResponse(
            {"success": False, "error": "Method not allowed."},
            status=405,
        )

    frame = request.FILES.get("image")
    image_error = validate_image(frame)
    if image_error:
        return JsonResponse({"success": False, "error": image_error}, status=400)
    if not FaceCase.objects.filter(is_active=True).exists():
        return JsonResponse({
            "success": True,
            "match": None,
            "message": "Create an active face report before starting recognition.",
        })

    frame_bytes = frame.read()
    boundary = uuid.uuid4().hex
    payload = (
        multipart_file(
            boundary, "image", "camera-frame.jpg", frame_bytes, "image/jpeg"
        )
        + f"--{boundary}--\r\n".encode()
    )
    service_request = urllib.request.Request(
        f"{FACE_SERVICE_URL}/recognize",
        data=payload,
        headers=face_service_headers(boundary),
        method="POST",
    )
    try:
        with urllib.request.urlopen(service_request, timeout=90) as response:
            result = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        logger.exception("Face recognition request failed.")
        return JsonResponse({
            "success": False,
            "error": "The face recognition engine is unavailable. Check its terminal for model errors.",
        }, status=503)
    if not result.get("success"):
        return JsonResponse({
            "success": False,
            "error": result.get("error", "Face recognition failed."),
        }, status=503)

    match = result.get("match")
    if not isinstance(match, dict):
        active_match_since.pop(request.face_user_id, None)
        return JsonResponse({
            "success": True,
            "match": None,
            "message": result.get("message", "No potential match in this frame."),
        })

    try:
        report = FaceCase.objects.get(pk=match.get("report_id"), is_active=True)
        similarity_score = float(match["similarity_score"])
    except (FaceCase.DoesNotExist, KeyError, TypeError, ValueError):
        logger.warning("Recognizer returned an invalid face report match.")
        active_match_since.pop(request.face_user_id, None)
        return JsonResponse({
            "success": True,
            "match": None,
            "message": "No active report matched this frame.",
        })
    if not 0 <= similarity_score <= 1:
        return JsonResponse({
            "success": False,
            "error": "Recognition engine returned an invalid similarity score.",
        }, status=502)

    now = time.monotonic()
    active = active_match_since.get(request.face_user_id)
    if active is None or active["report_id"] != report.id:
        active_match_since[request.face_user_id] = {
            "report_id": report.id,
            "first_seen": now,
        }
        active = active_match_since[request.face_user_id]

    detection = None
    cooldown_key = (request.face_user_id, report.id)
    last_captured = last_detection_at.get(cooldown_key, 0)
    stable_for = now - active["first_seen"]
    if (
        stable_for >= MATCH_CONFIRMATION_SECONDS
        and now - last_captured >= DETECTION_COOLDOWN_SECONDS
    ):
        try:
            latitude = parse_coordinate(request.POST.get("latitude"), -90, 90)
            longitude = parse_coordinate(request.POST.get("longitude"), -180, 180)
        except ValueError as exc:
            return JsonResponse({"success": False, "error": str(exc)}, status=400)
        try:
            detection = FaceDetection.objects.create(
                case=report,
                captured_image=frame_bytes,
                image_name=f"capture-{uuid.uuid4().hex}.jpg",
                image_content_type="image/jpeg",
                confidence=similarity_score,
                latitude=latitude,
                longitude=longitude,
            )
        except Exception:
            logger.exception("Could not save face detection for report %s.", report.id)
            return JsonResponse({
                "success": False,
                "error": "The potential match was found, but its detection record could not be saved.",
            }, status=503)
        last_detection_at[cooldown_key] = now

    return JsonResponse({
        "success": True,
        "match": serialize_case(request, report),
        "similarity_score": similarity_score,
        "review_required": True,
        "stable_for_seconds": round(stable_for, 1),
        "detection": serialize_detection(request, detection) if detection else None,
        "message": (
            "Potential match captured. Verify it manually."
            if detection
            else "Potential match only. Keep the person in frame for about 3 seconds to save a review record."
        ),
    })


def parse_coordinate(value, minimum, maximum):
    if value in (None, ""):
        return None
    try:
        coordinate = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("Location coordinates must be numeric.") from exc
    if not minimum <= coordinate <= maximum:
        raise ValueError("Location coordinates are outside the valid range.")
    return coordinate


@csrf_exempt
def face_detections(request):
    denied = face_access_required(request)
    if denied:
        return denied
    if request.method != "GET":
        return JsonResponse(
            {"success": False, "error": "Method not allowed."},
            status=405,
        )

    detections = FaceDetection.objects.select_related("case")[:200]
    return JsonResponse({
        "success": True,
        "detections": [
            serialize_detection(request, detection)
            for detection in detections
        ],
    })


@csrf_exempt
def face_report_photo(request, report_id):
    denied = face_access_required(request, ("traveler", "authority", "admin"))
    if denied:
        return denied
    try:
        report = FaceCase.objects.get(pk=report_id)
        response = FileResponse(
            BytesIO(bytes(report.photo)),
            content_type=report.photo_content_type,
        )
        response["Content-Disposition"] = 'inline; filename="reference-photo"'
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response
    except FaceCase.DoesNotExist:
        return JsonResponse({"success": False, "error": "Report not found."}, status=404)
    except (TypeError, ValueError):
        logger.exception("Could not open reference photo for report %s.", report_id)
        return JsonResponse({"success": False, "error": "Report photo is unavailable."}, status=503)


@csrf_exempt
def face_detection_photo(request, detection_id):
    denied = face_access_required(request)
    if denied:
        return denied
    try:
        detection = FaceDetection.objects.get(pk=detection_id)
        response = FileResponse(
            BytesIO(bytes(detection.captured_image)),
            content_type=detection.image_content_type,
        )
        response["Content-Disposition"] = 'inline; filename="detection-photo"'
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response
    except FaceDetection.DoesNotExist:
        return JsonResponse({"success": False, "error": "Detection not found."}, status=404)
    except (TypeError, ValueError):
        logger.exception("Could not open detection photo %s.", detection_id)
        return JsonResponse({"success": False, "error": "Detection photo is unavailable."}, status=503)
