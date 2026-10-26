# backend/livestream/tests/test_webhook_view.py
"""Characterization tests for POST/GET /api/livestream/webhook/, through the real URLconf and auth."""

import json

from livestream.models import Participant
from livestream.tests.base import LiveKitCase, make_user

URL = '/api/livestream/webhook/'


class WebhookViewTests(LiveKitCase):
    def setUp(self):
        super().setUp()
        # remaining=3 matches the three participant rows, so no handler resyncs by accident
        self.use_livekit(remaining=3)

    def post(self, payload, auth='Bearer anything'):
        body = payload if isinstance(payload, str) else json.dumps(payload)
        extra = {'HTTP_AUTHORIZATION': auth} if auth is not None else {}
        return self.client.post(URL, data=body, content_type='application/json', **extra)

    def test_get_reports_the_endpoint_is_active(self):
        # catches: the GET probe returning anything but success
        response = self.client.get(URL)
        self.assertEqual(response.status_code, 200)
        self.assertIs(response.json()['success'], True)

    def test_missing_authorization_is_rejected_without_side_effects(self):
        # catches: M01 (bearer check disabled)
        with self.assertLogs('livestream.views', level='ERROR'):
            response = self.post({'event': 'room_finished', 'room': {'name': 'room-1'}}, auth=None)
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json(), {'error': 'Invalid authorization header'})
        self.assertTrue(self.room_is_active())

    def test_non_bearer_authorization_is_rejected(self):
        # catches: M01, or the check accepting any Authorization scheme
        with self.assertLogs('livestream.views', level='ERROR'):
            response = self.post({'event': 'room_finished', 'room': {'name': 'room-1'}}, auth='Basic x')
        self.assertEqual(response.status_code, 401)
        self.assertTrue(self.room_is_active())

    def test_known_bug_accepts_unsigned_bearer_token(self):
        """Pins today's behavior; phase 7 (rooms) should verify the LiveKit signature.

        Any 'Bearer <anything>' header is accepted, so anyone can end a room.
        """
        response = self.post({'event': 'room_finished', 'room': {'name': 'room-1'}})
        self.assertEqual(response.status_code, 200)
        self.assertFalse(self.room_is_active())

    def test_invalid_json_returns_400(self):
        # catches: M03 (invalid JSON answered with 200)
        with self.assertLogs('livestream.views', level='ERROR'):
            response = self.post('{not json')
        self.assertEqual(response.status_code, 400)
        self.assertTrue(response.json()['error'].startswith('Invalid JSON data'))

    def test_unknown_event_is_acknowledged_without_changes(self):
        # catches: an unknown event being routed to a handler
        response = self.post({'event': 'track_published', 'room': {'name': 'room-1'}})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'success': True})
        self.assertTrue(self.room_is_active())
        self.assertEqual(self.usernames_in(self.room), ['alice', 'bob', 'host'])

    def test_room_finished_event_ends_the_room(self):
        # catches: M02 (room_finished and participant_left dispatch swapped)
        response = self.post({'event': 'room_finished', 'room': {'name': 'room-1'}})
        self.assertEqual(response.status_code, 200)
        self.assertFalse(self.room_is_active())
        self.assertEqual(self.usernames_in(self.room), [])

    def test_participant_joined_event_adds_the_participant(self):
        # catches: participant_joined not dispatched to its handler
        carol = make_user('carol')
        response = self.post({
            'event': 'participant_joined',
            'room': {'name': 'room-1'},
            'participant': {'identity': str(carol.id), 'name': 'carol'},
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Participant.objects.get(room=self.room, user=carol).role, 'viewer')

    def test_participant_left_event_removes_the_participant(self):
        # catches: M02 (dispatch swapped)
        self.livekit.remaining = 2
        response = self.post({
            'event': 'participant_left',
            'room': {'name': 'room-1'},
            'participant': {'identity': str(self.alice.id), 'name': 'alice'},
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.usernames_in(self.room), ['bob', 'host'])
        self.assertTrue(self.room_is_active())

    def test_handler_exception_returns_400_with_error(self):
        # catches: a handler failure turning into a 200 or an unhandled 500
        self.livekit.list_error = RuntimeError('livekit down')
        with self.assertLogs('livestream.views', level='ERROR'):
            response = self.post({
                'event': 'participant_left',
                'room': {'name': 'room-1'},
                'participant': {'identity': str(self.alice.id), 'name': 'alice'},
            })
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json(), {'error': 'livekit down'})

    def test_known_bug_anonymous_join_returns_400(self):
        """Pins today's behavior; phase 7 (rooms) should make anonymous joins work.

        The handler raises ValueError on the non-numeric identity and the view reports it as a 400.
        """
        with self.assertLogs('livestream.views', level='ERROR'):
            response = self.post({
                'event': 'participant_joined',
                'room': {'name': 'room-1'},
                'participant': {'identity': 'anonymous-1234', 'name': 'anonymous-1234'},
            })
        self.assertEqual(response.status_code, 400)
        self.assertIn('anonymous-1234', response.json()['error'])
        self.assertEqual(Participant.objects.count(), 3)
