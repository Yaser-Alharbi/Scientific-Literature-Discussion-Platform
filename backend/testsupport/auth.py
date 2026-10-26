# backend/testsupport/auth.py
"""Fake of the Firebase boundary used by FirebaseAuthentication."""

from contextlib import contextmanager
from unittest import mock


@contextmanager
def fake_firebase(tokens, error=None):
    """tokens maps a bearer token to a firebase uid, or to a dict of claims (uid, email, name).

    Any other token raises like a bad token. `error`, when given, is raised for every token
    instead, to fake an expired token or a Firebase outage. `fake.calls` records the keyword
    arguments of each verify_id_token call.
    """
    calls = []

    def verify_id_token(token, *args, **kwargs):
        calls.append(kwargs)
        if error is not None:
            raise error
        if token not in tokens:
            raise ValueError('Invalid Firebase ID token')
        claims = tokens[token]
        return dict(claims) if isinstance(claims, dict) else {'uid': claims}

    with mock.patch('authentication.authentication.auth.verify_id_token', new=verify_id_token):
        yield calls
