from django.contrib import admin
from .models import FaceCase, FaceDetection


@admin.register(FaceCase)
class FaceCaseAdmin(admin.ModelAdmin):
    list_display = ("name", "case_type", "is_active", "created_by", "created_at")
    list_filter = ("case_type", "is_active", "created_at")
    search_fields = ("name", "details")
    readonly_fields = ("created_at",)


@admin.register(FaceDetection)
class FaceDetectionAdmin(admin.ModelAdmin):
    list_display = ("case", "confidence", "review_status", "detected_at")
    list_filter = ("review_status", "detected_at", "case__case_type")
    search_fields = ("case__name",)
    readonly_fields = ("detected_at",)
