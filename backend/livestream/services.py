# backend/livestream/services.py

import asyncio
from functools import wraps
from django.conf import settings
from livekit import api

# Get LiveKit config from settings
LIVEKIT_API_URL = getattr(settings, 'LIVEKIT_API_URL', None)
LIVEKIT_API_KEY = getattr(settings, 'LIVEKIT_API_KEY', None)
LIVEKIT_API_SECRET = getattr(settings, 'LIVEKIT_API_SECRET', None)

# Helper function to run async LiveKit calls in a sync context
def sync_livekit(async_func):
    @wraps(async_func)
    def wrapper(*args, **kwargs):
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(async_func(*args, **kwargs))
        finally:
            loop.close()
    return wrapper

# Function to get a new LiveKit API client for each request
def get_livekit_client():
    return api.LiveKitAPI(
        url=LIVEKIT_API_URL,
        api_key=LIVEKIT_API_KEY,
        api_secret=LIVEKIT_API_SECRET
    )
