import { auth } from '@/lib/firebase';
import { config } from '@/lib/appConfig';
import { createApiClient } from '@/lib/apiClient';
import type { ProfileUpdate, RegisterPayload, User } from '@/types/user';

// currentUser.getIdToken() hands out the cached token and refreshes it shortly before it expires.
const client = createApiClient({
  baseUrl: config.apiBaseUrl,
  getToken: async () => {
    await auth.authStateReady();
    return auth.currentUser ? auth.currentUser.getIdToken() : null;
  },
});

export const api = {
  getProfile: () => client.request<User>('/api/user-profile'),

  register: (payload: RegisterPayload) =>
    client.request<{ message: string }>('/api/register', { method: 'POST', body: payload }),

  updateProfile: (changes: ProfileUpdate) =>
    client.request<User>('/api/update-profile', { method: 'POST', body: changes }),

  setPassword: (password: string) =>
    client.request<{ message: string }>('/api/set-password', { method: 'POST', body: { password } }),

  syncResetPassword: (password: string) =>
    client.request<{ message: string }>('/api/sync-reset-password', { method: 'POST', body: { password } }),

  // public: no token is sent, so a stale one cannot break the call
  getResearchInterests: () => client.request<string[]>('/api/research-interests', { auth: false }),
};
