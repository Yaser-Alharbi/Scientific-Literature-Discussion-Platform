# backend/livestream/tests/test_webhook_events.py
"""Characterization tests for the LiveKit webhook handlers, called directly with LiveKit faked."""

from livestream.models import Participant, Room
from livestream.tests.base import LiveKitCase, make_user
from livestream.webhook_events import (
    handle_participant_joined,
    handle_participant_left,
    handle_room_finished,
)


def event(room='room-1', identity=None, name=None):
    participant = {}
    if identity is not None:
        participant['identity'] = identity
    if name is not None:
        participant['name'] = name
    return {'room': {'name': room}, 'participant': participant}


class RoomFinishedTests(LiveKitCase):
    def setUp(self):
        super().setUp()
        self.other_room = Room.objects.create(room_id='room-2', name='room-2', host=self.bob)
        Participant.objects.create(room=self.other_room, user=self.alice, role='viewer')

    def test_room_goes_inactive_and_only_its_participants_are_deleted(self):
        # catches: M04 (participants kept), M05 (room stays active), a delete not scoped to the room
        handle_room_finished(event())
        self.assertFalse(self.room_is_active())
        self.assertEqual(self.usernames_in(self.room), [])
        self.assertEqual(self.usernames_in(self.other_room), ['alice'])
        self.assertTrue(Room.objects.get(pk=self.other_room.pk).is_active)

    def test_unknown_room_changes_nothing(self):
        # catches: a missing Room.DoesNotExist guard, or a handler that touches rows for an unknown name
        with self.assertLogs('livestream.webhook_events', level='WARNING'):
            handle_room_finished(event(room='no-such-room'))
        self.assertTrue(self.room_is_active())
        self.assertEqual(self.usernames_in(self.room), ['alice', 'bob', 'host'])


class ParticipantJoinedTests(LiveKitCase):
    def setUp(self):
        super().setUp()
        self.carol = make_user('carol')

    def test_new_participant_gets_viewer_role(self):
        # catches: M06 (default role changed)
        handle_participant_joined(event(identity=str(self.carol.id)))
        row = Participant.objects.get(room=self.room, user=self.carol)
        self.assertEqual(row.role, 'viewer')

    def test_existing_participant_keeps_their_role(self):
        # catches: M07 (get_or_create replaced by create / role overwritten on rejoin)
        Participant.objects.create(room=self.room, user=self.carol, role='guest')
        handle_participant_joined(event(identity=str(self.carol.id)))
        self.assertEqual(Participant.objects.filter(room=self.room, user=self.carol).count(), 1)
        self.assertEqual(Participant.objects.get(room=self.room, user=self.carol).role, 'guest')

    def test_unknown_user_adds_no_row(self):
        # catches: a row created for an identity that is not a user
        with self.assertLogs('livestream.webhook_events', level='WARNING'):
            handle_participant_joined(event(identity='999999'))
        self.assertEqual(Participant.objects.count(), 3)

    def test_unknown_room_adds_no_row(self):
        # catches: a row created without checking the room exists
        with self.assertLogs('livestream.webhook_events', level='WARNING'):
            handle_participant_joined(event(room='no-such-room', identity=str(self.carol.id)))
        self.assertEqual(Participant.objects.count(), 3)

    def test_missing_identity_adds_no_row(self):
        # catches: the identity guard removed
        handle_participant_joined(event())
        self.assertEqual(Participant.objects.count(), 3)

    def test_missing_room_name_adds_no_row(self):
        # catches: the room-name guard removed
        handle_participant_joined({'room': {}, 'participant': {'identity': str(self.carol.id)}})
        self.assertEqual(Participant.objects.count(), 3)

    def test_known_bug_anonymous_join_raises(self):
        """Pins today's behavior; phase 7 (rooms) should make anonymous joins work.

        User.id is an integer, so looking up 'anonymous-...' raises ValueError instead of
        DoesNotExist, and the handler does not catch it.
        """
        with self.assertRaises(ValueError):
            handle_participant_joined(event(identity='anonymous-1234'))
        self.assertEqual(Participant.objects.count(), 3)


class ParticipantLeftTests(LiveKitCase):
    def test_non_host_leaving_removes_only_their_row(self):
        # catches: M08 (host check inverted), a delete not scoped to the leaver
        self.use_livekit(remaining=2)
        handle_participant_left(event(identity=str(self.alice.id), name='alice'))
        self.assertEqual(self.usernames_in(self.room), ['bob', 'host'])
        self.assertTrue(self.room_is_active())
        self.assertEqual(self.livekit.delete_requests, [])

    def test_host_leaving_by_identity_ends_the_room(self):
        # catches: M08, M09 (livekit room not deleted), M10 (wrong room name sent to livekit)
        self.use_livekit(remaining=0)
        handle_participant_left(event(identity=str(self.host.id), name='Host Display'))
        self.assertFalse(self.room_is_active())
        self.assertEqual(self.usernames_in(self.room), [])
        self.assertEqual([r.room for r in self.livekit.delete_requests], ['room-1'])

    def test_host_without_a_row_is_found_by_name(self):
        # catches: M13 (name fallback removed)
        self.host_row.delete()
        self.use_livekit(remaining=0)
        handle_participant_left(event(identity=str(self.host.id), name='host'))
        self.assertFalse(self.room_is_active())
        self.assertEqual(self.usernames_in(self.room), [])
        self.assertEqual([r.room for r in self.livekit.delete_requests], ['room-1'])

    def test_host_without_a_row_and_without_a_name_does_not_end_the_room(self):
        # catches: the identity branch ending the room even though no row was found
        self.host_row.delete()
        self.use_livekit(remaining=2)
        handle_participant_left(event(identity=str(self.host.id)))
        self.assertTrue(self.room_is_active())
        self.assertEqual(self.usernames_in(self.room), ['alice', 'bob'])
        self.assertEqual(self.livekit.delete_requests, [])

    def test_empty_livekit_room_clears_stale_rows_and_ends_the_room(self):
        # catches: M11 (threshold), M12 (room.save dropped), a missing delete_room on the empty-room path
        self.use_livekit(remaining=0)
        handle_participant_left(event(identity=str(self.alice.id), name='alice'))
        self.assertFalse(self.room_is_active())
        self.assertEqual(self.usernames_in(self.room), [])
        self.assertEqual([r.room for r in self.livekit.delete_requests], ['room-1'])

    def test_count_mismatch_with_participants_left_is_not_resynced(self):
        # catches: M11 (mismatch treated as empty at remaining == 1)
        self.use_livekit(remaining=1)
        handle_participant_left(event(identity=str(self.alice.id), name='alice'))
        self.assertEqual(self.usernames_in(self.room), ['bob', 'host'])
        self.assertTrue(self.room_is_active())
        self.assertEqual(self.livekit.delete_requests, [])

    def test_livekit_delete_failure_keeps_database_changes_and_does_not_raise(self):
        # catches: the delete_room error escaping the handler, or DB changes rolled back with it
        self.use_livekit(remaining=0, delete_error=RuntimeError('livekit down'))
        with self.assertLogs('livestream.webhook_events', level='ERROR'):
            handle_participant_left(event(identity=str(self.host.id), name='Host Display'))
        self.assertFalse(self.room_is_active())
        self.assertEqual(self.usernames_in(self.room), [])
        self.assertEqual(len(self.livekit.delete_requests), 1)

    def test_livekit_list_failure_propagates_after_the_row_was_deleted(self):
        # catches: the list_participants error being swallowed
        self.use_livekit(list_error=RuntimeError('livekit down'))
        with self.assertRaisesMessage(RuntimeError, 'livekit down'):
            handle_participant_left(event(identity=str(self.alice.id), name='alice'))
        self.assertEqual(self.usernames_in(self.room), ['bob', 'host'])

    def test_unknown_room_makes_no_livekit_calls(self):
        # catches: LiveKit being queried for a room we do not have
        self.use_livekit(remaining=0)
        with self.assertLogs('livestream.webhook_events', level='WARNING'):
            handle_participant_left(event(room='no-such-room', identity=str(self.alice.id), name='alice'))
        self.assertEqual(self.livekit.list_requests, [])
        self.assertEqual(self.livekit.delete_requests, [])
        self.assertEqual(self.usernames_in(self.room), ['alice', 'bob', 'host'])

    def test_unknown_identity_falls_back_to_username(self):
        # catches: M13 (name fallback removed)
        self.use_livekit(remaining=2)
        with self.assertLogs('livestream.webhook_events', level='WARNING'):
            handle_participant_left(event(identity='999999', name='bob'))
        self.assertEqual(self.usernames_in(self.room), ['alice', 'host'])
        self.assertTrue(self.room_is_active())
        self.assertEqual(self.livekit.delete_requests, [])

    def test_known_bug_anonymous_participant_not_removed(self):
        """Pins today's behavior; phase 7 (rooms) should remove anonymous participants.

        The integer id lookup raises ValueError, the broad except swallows it, and neither
        the name branch nor the anonymous fallback runs, so the row stays.
        """
        anon = make_user('anonymous-1234')
        Participant.objects.create(room=self.room, user=anon, role='viewer')
        self.use_livekit(remaining=3)
        with self.assertLogs('livestream.webhook_events', level='ERROR'):
            handle_participant_left(event(identity='anonymous-1234', name='anonymous-1234'))
        self.assertEqual(self.usernames_in(self.room), ['alice', 'anonymous-1234', 'bob', 'host'])

    def test_known_bug_host_left_deletes_room_twice(self):
        """Pins today's behavior; phase 7 (rooms) should end the room once.

        With the real token shape (identity is the user id, name is the username) and a host
        row present, both the identity branch and the name branch run the host path.
        """
        self.use_livekit(remaining=0)
        handle_participant_left(event(identity=str(self.host.id), name='host'))
        self.assertFalse(self.room_is_active())
        self.assertEqual(self.usernames_in(self.room), [])
        self.assertEqual([r.room for r in self.livekit.delete_requests], ['room-1', 'room-1'])
