# backend/authentication/test_logging.py
"""Authentication failures are logged through `logging`, never printed."""

import contextlib
import io

from testsupport.api import FirebaseApiCase


class AuthenticationLoggingTests(FirebaseApiCase):
    def test_invalid_token_is_logged_as_a_warning_and_not_printed(self):
        # catches: the rejection going unlogged, or back to print()
        out = io.StringIO()
        with self.assertLogs('authentication.authentication', 'WARNING') as logs, contextlib.redirect_stdout(out):
            self.call('get', '/api/user-profile', 'not-a-token')
        self.assertEqual(len(logs.records), 1)
        self.assertIn('Invalid Firebase ID token', logs.output[0])
        self.assertEqual(out.getvalue(), '')

    def test_unregistered_user_is_logged_with_the_uid(self):
        with self.assertLogs('authentication.authentication', 'WARNING') as logs:
            self.call('get', '/api/user-profile', 'tok-gina')
        self.assertEqual(len(logs.records), 1)
        self.assertIn('uid-gina', logs.output[0])
