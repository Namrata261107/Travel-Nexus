from django.test import SimpleTestCase
from django.utils import timezone

from .auth_views import _new_registration_role, _optional_number


class AuthAndLocationValidationTests(SimpleTestCase):
    def test_new_profile_uses_requested_authority_role(self):
        profile_role = _new_registration_role({
            "user_metadata": {"requested_role": "authority"},
            "created_at": "2020-01-01T00:00:00+00:00",
        })
        self.assertEqual(profile_role, "authority")

    def test_unknown_registration_role_defaults_to_traveler(self):
        profile_role = _new_registration_role({
            "user_metadata": {"requested_role": "admin"},
            "created_at": timezone.now().isoformat(),
        })
        self.assertEqual(profile_role, "traveler")

    def test_location_values_must_be_finite_and_in_range(self):
        self.assertEqual(_optional_number({"latitude": 90}, "latitude", -90, 90), 90)
        for value in (True, "NaN", float("inf"), 91):
            with self.subTest(value=value), self.assertRaises(ValueError):
                _optional_number({"latitude": value}, "latitude", -90, 90)

    def test_bootstrap_requires_a_bearer_token(self):
        response = self.client.post(
            "/api/authority/auth/bootstrap/",
            data="{}",
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 401)

    def test_traveler_sos_requires_a_bearer_token(self):
        response = self.client.post(
            "/api/authority/traveler/sos/",
            data='{"latitude": 28.6, "longitude": 77.2}',
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 401)

    def test_alert_status_rejects_non_uuid(self):
        response = self.client.post(
            "/api/authority/alerts/not-a-uuid/status/",
            data='{"status":"resolved"}',
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)

# Create your tests here.
