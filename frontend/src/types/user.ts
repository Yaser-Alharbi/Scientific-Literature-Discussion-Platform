// Mirrors the backend's UserProfileSerializer (backend/authentication/serializers.py).
export interface User {
  email: string;
  institution: string;
  bio: string;
  research_interests: string[];
  auth_methods: string;
  first_name: string;
  last_name: string;
  password_set: boolean;
}

// Fields the profile page may change (backend ProfileUpdateSerializer).
export type ProfileUpdate = Partial<
  Pick<User, 'institution' | 'bio' | 'first_name' | 'last_name' | 'research_interests'>
>;

// What the signup flow posts to /api/register; the Firebase token supplies uid, email and, for Google, the name.
export interface RegisterPayload {
  auth_methods: 'email' | 'google';
  first_name?: string;
  last_name?: string;
  password?: string;
}
