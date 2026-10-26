# backend/livestream/tests/base.py

from contextlib import ExitStack

from django.test import TestCase

from authentication.models import User
from livestream.models import Participant, Room
from testsupport.auth import fake_firebase
from testsupport.fakes import FakeLiveKit


def make_user(username):
    return User.objects.create(username=username, auth_methods='email')


class LiveKitCase(TestCase):
    """Fixture shared by the webhook tests.

    Room 'room-1' hosted by `host`, with `alice` and `bob` as viewers and the host
    as a participant with role 'host'. Firebase and LiveKit are faked in every test,
    so no test can reach either the real services or the developer's .env.
    """

    def setUp(self):
        self.host = make_user('host')
        self.alice = make_user('alice')
        self.bob = make_user('bob')
        self.room = Room.objects.create(room_id='room-1', name='room-1', host=self.host)
        self.host_row = Participant.objects.create(room=self.room, user=self.host, role='host')
        self.alice_row = Participant.objects.create(room=self.room, user=self.alice, role='viewer')
        self.bob_row = Participant.objects.create(room=self.room, user=self.bob, role='viewer')

    def use_livekit(self, **kwargs):
        """Install a FakeLiveKit (and a Firebase fake that knows no tokens) for this test."""
        stack = ExitStack()
        self.addCleanup(stack.close)
        stack.enter_context(fake_firebase({}))
        self.livekit = FakeLiveKit(**kwargs)
        stack.enter_context(self.livekit.installed())
        return self.livekit

    def usernames_in(self, room):
        return sorted(Participant.objects.filter(room=room).values_list('user__username', flat=True))

    def room_is_active(self):
        return Room.objects.get(pk=self.room.pk).is_active
