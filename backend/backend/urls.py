
"""
URL configuration for backend project.
"""

from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path("admin/", admin.site.urls),

    # All Authority Dashboard APIs
    path("api/authority/", include("assistant.urls")),
]
