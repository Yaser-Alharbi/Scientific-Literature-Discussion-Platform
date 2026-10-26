# backend/authentication/test_error_format.py
"""Every error DRF raises is rendered as {"error": "<message>"}, the shape the frontend reads."""

from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from django_backend.api_errors import api_exception_handler
from testsupport.api import FirebaseApiCase


class ErrorFormatTests(FirebaseApiCase):
    def test_authentication_failure_body_is_an_error_message(self):
        # catches: DRF's {"detail": ...} body reaching the client
        response = self.call('get', '/api/user-profile')
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json(), {'error': 'Authentication credentials were not provided.'})

    def test_permission_and_not_found_use_the_error_key(self):
        self.assertEqual(api_exception_handler(PermissionDenied('Nope.'), {}).data, {'error': 'Nope.'})
        self.assertEqual(api_exception_handler(NotFound('Gone.'), {}).data, {'error': 'Gone.'})

    def test_status_code_is_kept(self):
        self.assertEqual(api_exception_handler(NotFound('Gone.'), {}).status_code, 404)

    def test_field_validation_errors_are_joined_with_the_field_name(self):
        # catches: the field name or message dropped, or the raw dict/list returned
        exc = ValidationError({'bio': ['Too long.'], 'institution': ['Required.', 'Bad.']})
        self.assertEqual(api_exception_handler(exc, {}).data,
                         {'error': 'bio: Too long. institution: Required. Bad.'})

    def test_non_field_validation_errors_are_just_the_message(self):
        self.assertEqual(api_exception_handler(ValidationError(['Bad input.']), {}).data, {'error': 'Bad input.'})

    def test_other_exceptions_are_left_to_django(self):
        self.assertIsNone(api_exception_handler(RuntimeError('boom'), {}))
