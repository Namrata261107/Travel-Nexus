"""Send geofence-entry SMS through SMS Gateway for Android (SMSGate)."""

import base64
import json
import logging
import re
import urllib.error
import urllib.request

from django.conf import settings

logger = logging.getLogger(__name__)


def _normalize_phone(value):
    raw = str(value or "").strip()
    digits = re.sub(r"\D", "", raw)
    if len(digits) == 10:
        digits = "91" + digits
    elif len(digits) == 11 and digits.startswith("0"):
        digits = "91" + digits[1:]
    if not 8 <= len(digits) <= 15:
        return None
    return f"+{digits}"


def send_geofence_entry_sms(phone, traveler_name, zone_name, zone_type):
    """Queue one SMS via the configured Android device for a zone entry."""
    username = settings.SMSGATE_USERNAME
    password = settings.SMSGATE_PASSWORD
    device_id = settings.SMSGATE_DEVICE_ID
    mobile = _normalize_phone(phone)

    missing = [
        name for name, value in (
            ("username", username),
            ("password", password),
            ("device ID", device_id),
        ) if not value
    ]
    if missing:
        logger.warning("Geofence SMS skipped: SMSGate settings are missing (%s).", ", ".join(missing))
        return False
    if not mobile:
        logger.warning("Geofence SMS skipped: traveler mobile number is missing or invalid.")
        return False

    zone_label = str(zone_type or "safety").replace("_", " ").strip()
    message = settings.SMSGATE_GEOFENCE_TEMPLATE.format(
        traveler_name=str(traveler_name or "Traveler").strip(),
        zone_name=str(zone_name or "safety zone").strip(),
        zone_type=zone_label,
    )
    payload = {
        "textMessage": {"text": message},
        "phoneNumbers": [mobile],
        "deviceId": device_id,
    }
    credentials = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")
    request = urllib.request.Request(
        settings.SMSGATE_SEND_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Basic {credentials}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            response_body = response.read().decode("utf-8")
            result = json.loads(response_body) if response_body else {}
            if response.status not in (200, 201, 202):
                logger.error("SMSGate rejected a geofence SMS (HTTP %s): %s", response.status, result)
                return False
        logger.info("SMSGate accepted a geofence SMS (message %s).", result.get("id", "queued"))
        return True
    except urllib.error.HTTPError as error:
        details = error.read().decode("utf-8", errors="replace")
        logger.error("SMSGate rejected a geofence SMS (HTTP %s): %s", error.code, details)
        return False
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, UnicodeDecodeError):
        logger.exception("SMSGate geofence SMS request failed.")
        return False
