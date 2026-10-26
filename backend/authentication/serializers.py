from rest_framework import serializers

from .models import User


class UserProfileSerializer(serializers.ModelSerializer):
    research_interests = serializers.SlugRelatedField(many=True, read_only=True, slug_field='name')

    class Meta:
        model = User
        fields = ['email', 'institution', 'bio', 'research_interests', 'auth_methods',
                  'first_name', 'last_name', 'password_set']
        read_only_fields = fields


class InterestNameField(serializers.CharField):
    """A research interest name: a non-blank string of at most 100 characters, surrounding whitespace removed."""

    def __init__(self, **kwargs):
        super().__init__(max_length=100, **kwargs)

    def to_internal_value(self, data):
        # CharField would silently turn 7 into "7"
        if not isinstance(data, str):
            self.fail('invalid')
        return super().to_internal_value(data)


class ProfileUpdateSerializer(serializers.Serializer):
    """Fields a user may change; only the ones present in the request are applied."""

    institution = serializers.CharField(max_length=100, required=False, allow_blank=True)
    bio = serializers.CharField(required=False, allow_blank=True)
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    research_interests = serializers.ListField(child=InterestNameField(), required=False)
