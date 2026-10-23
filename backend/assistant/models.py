from django.conf import settings
from django.db import models


class FaceCase(models.Model):
    class CaseType(models.TextChoices):
        SUSPICIOUS = "suspicious", "Suspicious"
        MISSING_CHILD = "missing_child", "Missing child"
        MISSING_PERSON = "missing_person", "Missing person"

    name = models.CharField(max_length=160)
    case_type = models.CharField(max_length=24, choices=CaseType.choices)
    details = models.TextField(blank=True)
    last_seen_location = models.CharField(max_length=255, blank=True)
    photo = models.BinaryField()
    photo_name = models.CharField(max_length=255)
    photo_content_type = models.CharField(max_length=100)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="face_cases",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.get_case_type_display()})"


class FaceDetection(models.Model):
    case = models.ForeignKey(
        FaceCase,
        on_delete=models.PROTECT,
        related_name="detections",
    )
    captured_image = models.BinaryField()
    image_name = models.CharField(max_length=255)
    image_content_type = models.CharField(max_length=100)
    confidence = models.FloatField()
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    detected_at = models.DateTimeField(auto_now_add=True)
    review_status = models.CharField(max_length=32, default="pending_review")

    class Meta:
        ordering = ["-detected_at"]

    def __str__(self):
        return f"Potential match for {self.case.name} at {self.detected_at}"
