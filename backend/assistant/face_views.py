import logging
import uuid
from io import BytesIO

from django.db import connection
from django.http import FileResponse, JsonResponse
from django.urls import reverse
from django.views.decorators.csrf import csrf_exempt
from PIL import Image, UnidentifiedImageError

from .models import FaceCase, FaceDetection
from .auth_views import _verified_user

logger = logging.getLogger(__name__)
MAX_IMAGE_BYTES = 8 * 1024 * 1024


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
        return JsonResponse({"success": False, "error": "Method not allowed."}, status=405)

    name = request.POST.get("name", "").strip()
    report_type = request.POST.get("report_type", "").strip()
    description = request.POST.get("description", "").strip()
    photo = request.FILES.get("photo")
    if not name or len(name) > 120:
        return JsonResponse({"success": False, "error": "Enter a name between 1 and 120 characters."}, status=400)
    if report_type not in FaceCase.CaseType.values:
        return JsonResponse({"success": False, "error": "Choose suspicious, missing child, or missing person."}, status=400)
    if len(description) > 1000:
        return JsonResponse({"success": False, "error": "Description must be 1,000 characters or fewer."}, status=400)
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
        "message": "Report saved. Its reference photo will be compared in the browser when matching starts.",
    }, status=201)


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
    if request.method == "POST":
        report_id = request.POST.get("report_id", "")
        image = request.FILES.get("image")
        try:
            report = FaceCase.objects.get(pk=report_id, is_active=True)
            similarity_score = float(request.POST.get("similarity_score", ""))
            latitude = parse_coordinate(request.POST.get("latitude"), -90, 90)
            longitude = parse_coordinate(request.POST.get("longitude"), -180, 180)
        except FaceCase.DoesNotExist:
            return JsonResponse({"success": False, "error": "Active person report not found."}, status=404)
        except (TypeError, ValueError):
            return JsonResponse({"success": False, "error": "Report, similarity, or location data is invalid."}, status=400)
        if not 0 <= similarity_score <= 1:
            return JsonResponse({"success": False, "error": "Similarity score must be between 0 and 1."}, status=400)
        image_error = validate_image(image)
        if image_error:
            return JsonResponse({"success": False, "error": image_error}, status=400)
        try:
            detection = FaceDetection.objects.create(
                case=report,
                captured_image=image.read(),
                image_name=f"browser-capture-{uuid.uuid4().hex}.jpg",
                image_content_type="image/jpeg",
                confidence=similarity_score,
                latitude=latitude,
                longitude=longitude,
            )
        except Exception:
            logger.exception("Could not save browser face detection for report %s.", report.id)
            return JsonResponse({"success": False, "error": "Could not save the potential match for review."}, status=503)
        return JsonResponse({
            "success": True,
            "detection": serialize_detection(request, detection),
            "message": "Potential match saved for human review. It is not a confirmed identity.",
        }, status=201)

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
