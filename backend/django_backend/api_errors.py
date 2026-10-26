# backend/django_backend/api_errors.py
"""One error shape for the whole API: {"error": "<message>"}, which is what the frontend reads."""

from rest_framework.views import exception_handler


def _messages(detail):
    if isinstance(detail, dict):
        return ' '.join(f'{field}: {_messages(value)}' for field, value in detail.items())
    if isinstance(detail, list):
        return ' '.join(_messages(item) for item in detail)
    return str(detail)


def api_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is not None:
        # DRF puts the message under "detail" for most errors, and uses the bare field dict or list for validation errors
        data = response.data
        response.data = {'error': _messages(data['detail'] if isinstance(data, dict) and 'detail' in data else data)}
    return response
