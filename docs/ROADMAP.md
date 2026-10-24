# Roadmap

Status: `[ ]` todo · `[~]` in progress · `[x]` done. Update on completion.

| # | Phase | Agent | Status |
|---|-------|-------|--------|
| 1 | Repo hygiene | `hygiene` | [x] done, credentials verified by user (see `docs/audit.md`) |
| 2 | Refactor stage 1: move/organize only | `organizer` | [ ] |
| 3 | Deploy working demo | `deployer` | [ ] |
| 4 | Demo user | `demo-user` | [ ] |
| 5 | Refactor stage 2: real code changes | `refactorer` | [ ] |
| 6 | UI cleanup | `ui-polisher` | [ ] |
| 7 | README and portfolio polish | `readme-writer` | [ ] |
| 8 | Maintenance (CI, Docker, deps) | `maintainer` | [ ] |

## 1. Repo hygiene
Delete cruft (`frontend/fiies.txt`, `auth-test/`, `authdebugger.tsx`, duplicate `profile/` pages, duplicate `livekit-overrides.css`, stray lockfiles, unused `environment.yml`, `.s2i`). Remove debug logs and dead code. Audit files and git history for leaked keys; report anything to rotate. **No README work.**
**Credentials check (required):** do not assume Firebase, LiveKit or SerpAPI keys still work. Test each one live (Firebase sign-in + token verification in Django, LiveKit token creation + joining a room, a SerpAPI search) and record pass/fail in `docs/audit.md`. If a key is dead or the account/project is gone, flag it for the user to replace; never print key values.
Done when: audit report in `docs/audit.md` (including credential test results), cruft removed, app still builds.

## 2. Refactor stage 1: move and organize only
Separation of concerns by **moving code blocks, not editing them**. Backend: split `views.py` into serializers/services/views. Frontend: API calls into `lib/`, large pages into components, fix folder/file naming. Behavior must be identical.
Done when: `next build` passes, backend starts and migrates, manual click-through matches before.

## 3. Deploy working demo
Frontend on Vercel; backend + Postgres on Render or Railway; Firebase and LiveKit Cloud unchanged. Env-var config, production Django settings (`DEBUG`, `ALLOWED_HOSTS`, CORS/CSRF, static files). Goal: live URL fast.
Re-test Firebase (authorized domains must include the deployed URL), LiveKit and SerpAPI against the deployed environment.
Done when: signup/login, paper search, and a room all work on the live URL.

## 4. Demo user
"Try as demo" button, seeded rooms/extracts/papers, SerpAPI usage cap/caching. Minimal changes on top of the deployed baseline.

## 5. Refactor stage 2
Analyze the codebase first and write findings to `docs/refactor-findings.md`; get approval; then change code (typing, duplication, error handling, validation, tests). Redeploy.

## 6. UI cleanup
Design tokens, shared components, loading/empty/error states, mobile, landing page. Redeploy.

## 7. README and portfolio polish
Screenshots/GIF, live link, architecture diagram, license, setup docs.

## 8. Maintenance
GitHub Actions (lint, build, test), Docker, dependency updates.

## Parking lot
Out-of-scope findings go here with the phase they belong to.

### From phase 1
- Phase 3: remaining prints in `papers/views.py` (4), `authentication/authentication.py` (1), `settings.py` (1) -> `logger`; `DEBUG=True`, `ALLOWED_HOSTS=*`, hardcoded QMUL CORS/CSRF origins, insecure cookie flags, disabled password validators, `DATABASE_PASSWORD` default; `next.config.js` wildcard CORS with credentials, `eslint.ignoreDuringBuilds`, `localhost:8000` rewrite and its redundant second rewrite; `.env.example` missing `CROSSREF_EMAIL` and `DATABASE_*`; `requirements.txt` is UTF-16 and pins `psycopg2-binary` that fails to build on Python 3.13; includes selenium and debug-toolbar; `backend/.s2i/` decision.
- Phase 5: duplicate `authentication` `0007/0008_alter_user_id` migrations; missing `livestream` `0004`; `paperStore.ts` repeats the same fetch for its retry; many `no-explicit-any` lint errors; `Q` import unused in `livestream/views.py`.
- Phase 7: README port mismatch (Selenium tests use 4000).
