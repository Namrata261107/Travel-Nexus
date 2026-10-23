
from django.urls import path
from . import views
from . import face_views
from . import auth_views
from . import lost_found_views
from .reports_views import reports_data

urlpatterns = [
    # System
    path("health/", views.health_check, name="authority-health"),
    path("auth/bootstrap/", auth_views.auth_bootstrap, name="auth-bootstrap"),
    path(
        "traveler/location/",
        auth_views.traveler_location,
        name="traveler-location",
    ),
    path(
        "traveler/geofence-alerts/",
        auth_views.traveler_geofence_alerts,
        name="traveler-geofence-alerts",
    ),
    path(
        "traveler/sos/",
        auth_views.traveler_sos,
        name="traveler-sos",
    ),
    path(
        "lost-found/reports/",
        lost_found_views.lost_found_reports,
        name="lost-found-reports",
    ),
    path(
        "lost-found/reports/<uuid:report_id>/",
        lost_found_views.lost_found_report_detail,
        name="lost-found-report-detail",
    ),

    # Dashboard
    path(
        "dashboard-summary/",
        views.dashboard_summary,
        name="dashboard-summary",
    ),

    # Travelers
    path("travelers/", views.travelers_list, name="travelers-list"),

    # Emergency Alerts
    path("alerts/", views.alerts_list, name="alerts-list"),
    path(
        "alerts/<str:alert_id>/status/",
        views.update_alert_status,
        name="update-alert-status",
    ),

    # Geofences
    path("geofences/", views.geofences_api, name="geofences-api"),
    path(
        "geofences/<str:geofence_id>/",
        views.geofences_api,
        name="geofences-api-detail",
    ),
    path(
        "geofences/create/",
        views.create_geofence,
        name="create-geofence",
    ),
    path(
        "geofences/<str:geofence_id>/update/",
        views.update_geofence,
        name="update-geofence",
    ),
    path(
        "geofences/<str:geofence_id>/delete/",
        views.delete_geofence,
        name="delete-geofence",
    ),
    path(
        "geofences/<str:geofence_id>/status/",
        views.toggle_geofence_status,
        name="toggle-geofence-status",
    ),

    # AI Assistant
    path("ai-chat/", views.ai_assistant_chat, name="ai-assistant-chat"),

    # Reports
    path("reports/", reports_data, name="reports-data"),

    # Face Recognition
    path(
        "face/cases/",
        face_views.face_cases,
        name="face-cases",
    ),
    path(
        "face/prepare/",
        face_views.prepare_face_recognition,
        name="face-prepare",
    ),
    path(
        "face/recognize/",
        face_views.face_recognition_scan,
        name="face-recognize",
    ),
    path(
        "face/detections/",
        face_views.face_detections,
        name="face-detections",
    ),
    path(
        "face/cases/<int:report_id>/photo/",
        face_views.face_report_photo,
        name="face-case-photo",
    ),
    path(
        "face/detections/<int:detection_id>/photo/",
        face_views.face_detection_photo,
        name="face-detection-photo",
    ),
    path("geofences/", views.geofences_api, name="geofences-api"),
path("geofences/create/", views.create_geofence, name="create-geofence"),
path("geofences/<str:geofence_id>/update/", views.update_geofence, name="update-geofence"),
path("geofences/<str:geofence_id>/delete/", views.delete_geofence, name="delete-geofence"),
path("geofences/<str:geofence_id>/status/", views.toggle_geofence_status, name="toggle-geofence-status"),
path("geofences/<str:geofence_id>/", views.geofences_api, name="geofences-api-detail"),
]
