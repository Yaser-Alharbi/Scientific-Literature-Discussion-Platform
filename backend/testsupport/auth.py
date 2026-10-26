# backend/testsupport/auth.py
"""Fake of the Firebase boundary used by FirebaseAuthentication."""

from contextlib import contextmanager
from unittest import mock


@contextmanager
def fake_firebase(tokens):
    """tokens maps a bearer token to a firebase uid. Any other token raises like a bad token."""

    def verify_id_token(token, *args, **kwargs):
        if token not in tokens:
            raise ValueError('Invalid Firebase ID token')
        return {'uid': tokens[token]}

    with mock.patch('authentication.authentication.auth.verify_id_token', new=verify_id_token):
        yield
