# backend/authentication/urls.py

from django.urls import path
from . import views

urlpatterns = [
    path('api/set-password', views.set_password),
    path('api/user-profile', views.user_profile),
    path('api/update-profile', views.update_profile),
    path('api/register', views.register),
    path('api/sync-reset-password', views.sync_reset_password),
    path('api/research-interests', views.get_research_interests),
]

