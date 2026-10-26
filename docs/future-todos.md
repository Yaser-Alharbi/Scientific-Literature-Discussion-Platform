# Future todos

Deliberately not done in the demo build. Each is a decision recorded, not a bug.

- **Make research interests authenticated.** `GET /api/research-interests` is public (decided in phase 4). Requiring a Firebase token would mean the rooms and profile callers send it; the interest names carry no user data.
- **Stop mirroring passwords into Django (phase 4 redesign "P1", declined for now).** The Django-side password is used only by `/admin/` and DRF `SessionAuthentication`, yet the plaintext password is POSTed to the backend at signup, set-password and reset. Dropping it would remove `sync_reset_password` and the password fields of `register` and `set_password`, and needs a decision on what `password_set` means. Post-demo option.
