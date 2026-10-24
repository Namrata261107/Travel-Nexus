import json

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST


@csrf_exempt
@require_POST
def traveler_ai_chat(request):
    try:
        body = json.loads(request.body or b"{}")
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({"success": False, "error": "Invalid JSON request."}, status=400)

    if not isinstance(body, dict):
        return JsonResponse({"success": False, "error": "Request body must be a JSON object."}, status=400)

    question = body.get("message", "")
    if not isinstance(question, str) or not question.strip():
        return JsonResponse({"success": False, "error": "Please enter a question."}, status=400)

    question = question.strip()
    if len(question) > 4000:
        return JsonResponse({"success": False, "error": "Question is too long."}, status=400)

    lower = question.lower()
    if any(word in lower.split() for word in ("hi", "hello", "hey", "hii")):
        reply = "Hello! I can help with practical travel safety, emergency steps, and using the safety features in your traveller dashboard. What would you like help with?"
    elif any(word in lower for word in ("emergency", "emergencies", "danger", "unsafe", "help me")):
        reply = "If you are in immediate danger, move to a safer public place and contact local emergency services. Share your location with someone you trust. You can also use the dashboard SOS button to prepare an alert, but do not rely on the app as a replacement for emergency services."
    elif any(word in lower for word in ("geofence", "restricted area", "restricted zone")):
        reply = "A geofence is a virtual boundary around an area. Check the map and any safety notices before entering unfamiliar or restricted places. If you receive a warning, leave the area calmly and follow local authorities' instructions."
    elif any(word in lower for word in ("alert", "notification", "warning")):
        reply = "Open Alerts or Notifications in your dashboard to review safety updates. Check the alert's location and time, follow instructions from local authorities, and verify urgent information with an official source."
    elif any(word in lower for word in ("lost", "missing item", "found item")):
        reply = "Use Lost & Found in the traveller dashboard to submit an item report. Include a clear description and where and when you last saw the item, but avoid posting sensitive personal information."
    elif any(word in lower for word in ("safe", "safety", "travel", "trip")):
        reply = "For safer travel, keep your documents and emergency contacts accessible, use well-reviewed transport, stay aware of local guidance, and share your itinerary with someone you trust. Tell me your destination or concern for more specific suggestions."
    else:
        reply = "I can help with travel safety, emergency preparedness, geofence warnings, dashboard alerts, and Lost & Found. Share a little more about your question and I’ll point you to the right guidance."

    return JsonResponse({"success": True, "reply": reply})
