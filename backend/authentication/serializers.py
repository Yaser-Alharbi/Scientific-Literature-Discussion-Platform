from rest_framework import serializers

from .models import User


class UserProfileSerializer(serializers.ModelSerializer):
    research_interests = serializers.SlugRelatedField(many=True, read_only=True, slug_field='name')

    class Meta:
        model = User
        fields = ['email', 'institution', 'bio', 'research_interests', 'auth_methods',
                  'first_name', 'last_name', 'password_set']
        read_only_fields = fields
