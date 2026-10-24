
"""
URL configuration for backend project.
"""

from django.contrib import admin
from django.urls import path, include
from assistant.traveler_views import traveler_ai_chat

urlpatterns = [
    path("admin/", admin.site.urls),

    # All Authority Dashboard APIs
    path("api/authority/", include("assistant.urls")),
    path("api/traveler/ai-chat/", traveler_ai_chat, name="traveler-ai-chat"),
]
