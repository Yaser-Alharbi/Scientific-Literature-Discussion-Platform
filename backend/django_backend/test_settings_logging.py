# backend/django_backend/test_settings_logging.py
import contextlib
import importlib
import io
import os
from unittest import mock

from django.test import SimpleTestCase

from django_backend import settings


class SettingsLoggingTests(SimpleTestCase):
    def test_missing_firebase_credentials_warn_through_the_logger_not_print(self):
        # catches: print() instead of the logger at settings import
        env = {k: v for k, v in os.environ.items() if k != 'FIREBASE_SERVICE_ACCOUNT'}
        out = io.StringIO()
        # load_dotenv is stubbed so a developer's .env cannot put real credentials back
        with mock.patch.dict(os.environ, env, clear=True), mock.patch('dotenv.load_dotenv'), \
                self.assertLogs('django_backend.settings', 'WARNING') as logs, contextlib.redirect_stdout(out):
            importlib.reload(settings)
        self.assertEqual(len(logs.records), 1)
        self.assertIn('FIREBASE_SERVICE_ACCOUNT', logs.output[0])
        self.assertEqual(out.getvalue(), '')
