from django.urls import path
from . import views

urlpatterns = [
    path('rooms/', views.room_list, name='room_list'),
    path('rooms', views.room_list, name='room_list'),  
    path('rooms/create/', views.create_room, name='create_room'),
    path('rooms/create', views.create_room, name='create_room'),  
    path('rooms/<str:room_id>/', views.room_detail, name='room_detail'),
    path('rooms/<str:room_id>', views.room_detail, name='room_detail'),  
    path('rooms/<str:room_id>/token/', views.get_room_token, name='get_room_token'),
    path('rooms/<str:room_id>/token', views.get_room_token, name='get_room_token'),  
    path('rooms/<str:room_id>/participants/', views.room_participants, name='room_participants'),
    path('rooms/<str:room_id>/participants/<str:participant_id>/role/', views.update_participant_role, name='update_participant_role'),
    path('rooms/<str:room_id>/participants/<str:participant_id>/role', views.update_participant_role, name='update_participant_role'),  # Keep old URL
    path('rooms/<str:room_id>/delete/', views.delete_room, name='delete_room'),
    path('rooms/<str:room_id>/delete', views.delete_room, name='delete_room'),  
    path('webhook/', views.webhook, name='webhook'),
    path('webhook', views.webhook, name='webhook'),  
    path('rooms/<str:room_id>/shared-extracts/', views.get_room_extracts, name='get_room_extracts'),
    path('rooms/<str:room_id>/shared-extracts', views.get_room_extracts, name='get_room_extracts'),
    path('rooms/<str:room_id>/share-extract/', views.share_extract_in_room, name='share_extract_in_room'),
    path('rooms/<str:room_id>/share-extract', views.share_extract_in_room, name='share_extract_in_room'),
]
