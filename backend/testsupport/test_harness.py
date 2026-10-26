# backend/testsupport/test_harness.py
"""Tests for the test harness itself: the guard must catch stray network use and the fakes must be strict."""

import inspect
import socket
import unittest

import requests
from django.test import SimpleTestCase
from livekit.api.room_service import RoomService

from django_backend.test_runner import NetworkAccessBlocked
from testsupport.fakes import FakeHTTP, FakeLiveKit, make_response


class NetworkGuardTests(SimpleTestCase):
    def test_hostname_request_raises_network_access_blocked(self):
        # catches: the getaddrinfo patch removed, so a stray call fails as a swallowed ConnectionError
        with self.assertRaises(NetworkAccessBlocked):
            requests.get('https://example.com/')

    def test_raw_ip_connection_raises_network_access_blocked(self):
        # catches: the create_connection patch removed or loopback check inverted
        with self.assertRaises(NetworkAccessBlocked):
            socket.create_connection(('93.184.216.34', 443))

    def test_guard_is_not_an_exception_subclass(self):
        # catches: the guard made an Exception, which `except Exception` in production code would swallow
        self.assertFalse(issubclass(NetworkAccessBlocked, Exception))


class FakeHTTPTests(SimpleTestCase):
    def test_unrouted_host_fails(self):
        # catches: the fake silently answering for a host the test did not plan for
        fake = FakeHTTP()
        fake.queue('api.crossref.org', make_response(200, {}))
        with fake.installed():
            with self.assertRaises(AssertionError):
                requests.get('https://serpapi.com/search')

    def test_url_query_and_params_are_merged(self):
        # catches: the recorder dropping either the URL query (CrossRef) or params= (SerpAPI)
        fake = FakeHTTP()
        fake.queue('example.org', make_response(200, {}))
        with fake.installed():
            requests.get('https://example.org/x?a=1&b=2', params={'c': 3}, timeout=7)
        call = fake.calls[0]
        self.assertEqual(call.host, 'example.org')
        self.assertEqual(call.path, '/x')
        self.assertEqual(call.query, {'a': '1', 'b': '2', 'c': 3})
        self.assertEqual(call.kwargs, {'timeout': 7})

    def test_malformed_body_really_raises_on_json(self):
        # catches: make_response returning something whose .json() cannot fail like a real body
        with self.assertRaises(ValueError):
            make_response(200, raw=b'<html>').json()


class FakeLiveKitDriftTests(unittest.TestCase):
    def test_fake_methods_exist_on_installed_room_service(self):
        # catches: a livekit upgrade renaming a method the fake still offers
        fake = FakeLiveKit()
        for name in ('list_participants', 'delete_room'):
            self.assertTrue(inspect.iscoroutinefunction(getattr(RoomService, name)), name)
            self.assertTrue(inspect.iscoroutinefunction(getattr(fake.room, name)), name)


class FakeFirebaseTests(SimpleTestCase):
    def verify(self, token):
        from authentication import authentication
        return authentication.auth.verify_id_token(token)

    def test_uid_string_gives_claims_with_only_the_uid(self):
        # catches: the plain-uid form (used by the livestream tests) stops working
        from testsupport.auth import fake_firebase
        with fake_firebase({'t': 'uid-1'}):
            self.assertEqual(self.verify('t'), {'uid': 'uid-1'})

    def test_claims_dict_is_returned_whole(self):
        # catches: email or name claims dropped, which register depends on
        from testsupport.auth import fake_firebase
        claims = {'uid': 'uid-2', 'email': 'a@example.com', 'name': 'A B'}
        with fake_firebase({'t': claims}):
            self.assertEqual(self.verify('t'), claims)

    def test_unknown_token_raises_value_error(self):
        # catches: unknown tokens accepted
        from testsupport.auth import fake_firebase
        with fake_firebase({'t': 'uid-1'}):
            with self.assertRaises(ValueError):
                self.verify('other')

    def test_error_is_raised_for_every_token(self):
        # catches: the injected error ignored for known tokens
        from testsupport.auth import fake_firebase
        with fake_firebase({'t': 'uid-1'}, error=RuntimeError('down')):
            with self.assertRaises(RuntimeError):
                self.verify('t')
