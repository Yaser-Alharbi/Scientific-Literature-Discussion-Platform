# Roadmap

Status: `[ ]` todo · `[~]` in progress · `[x]` done. Update on completion.

Each phase is built on its own branch (see the Branch column), merged into `cleanup` through a PR by the user; the phase is ticked in that PR.

Direction: **fix and rebuild the core first; deploy last.** Same stack (Django, Next.js, Firebase, LiveKit), same features (auth/profile, paper search, extracts, rooms). The existing code is the base: fix and clean up first, redesign a piece only when that is clearly better, and reuse what the old version got right.

| # | Phase | Agent | Branch | Status |
|---|-------|-------|--------|--------|
| 1 | Repo hygiene | `hygiene` | `phase-1-hygiene` | [x] done, credentials verified by user (see `docs/audit.md`) |
| 2 | Move/organize only | `organizer` | `phase-2-organizer` | [x] done and approved by user |
| 3 | Tooling (lint, typecheck, test setup) | `tooling` | `phase-3-tooling` | [ ] |
| 4 | Core: foundations (shared infrastructure, auth, profile) | `core-foundations` | `phase-4-foundations` | [ ] |
| 5 | Core: paper search | `core-papers` | `phase-5-papers` | [ ] |
| 6 | Core: extracts | `core-extracts` | `phase-6-extracts` | [ ] |
| 7 | Core: rooms (live discussion) | `core-rooms` | `phase-7-rooms` | [ ] |
| 8 | UI cleanup | `ui-polisher` | `phase-8-ui` | [ ] |
| 9 | Demo user | `demo-user` | `phase-9-demo-user` | [ ] |
| 10 | Maintenance (CI, Docker, deps) | `maintainer` | `phase-10-maintenance` | [ ] |
| 11 | README and portfolio polish | `readme-writer` | `phase-11-readme` | [ ] |
| 12 | Deploy (final step) | `deployer` | `phase-12-deploy` | [ ] |

## 1. Repo hygiene (done)
Removed cruft, dead code and debug output; credentials verified. See `docs/audit.md`.

## 2. Move/organize only (done)
Split `livestream/views.py` (LiveKit helpers to `services.py`, webhook handlers to `webhook_events.py`) and `papers/views.py` (enrichment to `services.py`); renamed `PageLoadDelay.tsx`. No logic changes.

## 3. Tooling
Make the "Definition of done" in `CLAUDE.md` real, so every later phase can run the same checks. No feature or behavior changes. Follow `docs/testing.md`.
- Frontend: add a `typecheck` script (`tsc --noEmit`). Get `npm run lint` to a known state: either fix the existing problems (mostly `no-explicit-any`) or record a baseline so new problems fail. Ask the user which. Add a frontend test runner only if the core phases need frontend logic tests (new package, needs approval).
- Backend: a test setup that runs without a browser, using Django's built-in runner (no new packages) with SerpAPI, LiveKit, Firebase and network calls faked at the boundary. The existing Selenium suite stays, clearly marked as optional and skipped by default. Make `pip install -r backend/requirements.txt` work cleanly (re-encode the UTF-16 file to UTF-8, document the supported Python version; any version bump needs approval).
- Seed the suite with characterization tests that pin today's behavior of the code the core phases will touch (starting with the webhook handlers and paper enrichment, which have no tests).
- Document the exact check commands in `CLAUDE.md`'s Definition of done (propose the edit; the user applies it).
Done when: lint, typecheck, build and `manage.py test` all run from a clean checkout and pass (or match the recorded baseline), and each seeded test has passed the mutation check in `docs/testing.md`.

## Core rebuild (phases 4-7): shared method
Each core phase is one feature area, run by its own agent, in this order, because later ones build on earlier ones.
1. **Analyze first.** Read the feature end to end (backend, store, pages) and write `docs/core/<area>.md`: what works, what is broken, what is fragile, and for each issue a recommendation of **fix** or **redesign** with the reason.
2. **Get user approval** of that list before changing code. Redesigns need explicit approval, one by one.
3. **Fix before redesign.** When redesigning, start from the existing implementation (keep what works, keep the data model unless there is a reason, keep the user-facing behavior unless approved).
4. **No new features.** Enhancing means better reliability, error handling, validation, performance and code quality, not new capabilities, unless the user asks.
5. **Tests for what you change** (backend tests with mocked third parties; frontend type and build checks). Credential-dependent checks (Firebase, LiveKit, SerpAPI) are listed for the user to run.
6. Follow `CLAUDE.md` and `docs/testing.md`: tests are written first and watched failing (or, for refactors, characterization tests that pin current behavior are written first and mutation-checked); keep refactors and behavior changes in separate commits; no new dependencies without approval.
7. Each phase ends with a short "Done when" check, the user's manual click-through of that feature, and an updated parking lot.

## 4. Core: foundations
Shared infrastructure the other features depend on.
- Frontend: one typed API client and one env/config module (replace scattered `fetch` calls and `NEXT_PUBLIC_API_BASE_URL` reads), consistent error handling, store cleanup (`authStore`, shared types, `no-explicit-any`).
- Backend: one authentication helper replacing the repeated Firebase token blocks in `authentication/views.py`; serializer convention (replace inline response dicts) and consistent error responses; logging via `logger` everywhere (remaining prints in `papers/views.py`, `authentication/authentication.py`, `settings.py`); research interests served by one view.
- Auth and profile flows: signup, login (email and Google), password set/reset, profile update.
- Migrations: duplicate `authentication` `0007/0008_alter_user_id`, gap at `livestream` `0004` (decide, do not edit applied migrations blindly).
- Tests: write them with the tooling from phase 3, following `docs/testing.md`; do not add tooling here.

## 5. Core: paper search
Search flow (SerpAPI), DOI and open-access enrichment (CrossRef, Unpaywall), caching and rate limiting, `paperStore` search and retry (the retry duplicates the same fetch), results UI behavior, error and empty states. Also: unused `json` import in `papers/views.py`.

## 6. Core: extracts
Saving, listing, deleting extracts, the extract modal, the extracts page, and sharing from the library. **Known bug:** `paperStore.ts:392` calls `/api/papers/extracts/${id}/share/`, which has no backend route. Decide fix or redesign with the rooms sharing flow in mind (`share_extract_in_room`).

## 7. Core: rooms (live discussion)
Room create/list/delete, tokens and roles (host, guest, viewer), participants, webhook handling, shared extracts in a room, and the 1,415-line room page.
- **Security:** the LiveKit webhook accepts any `Bearer <anything>` header, so anyone can post fake `room_finished`/`participant_left` events and deactivate or delete rooms. Verify the signature with LiveKit's `WebhookReceiver`.
- Redesign candidates: `participant_left` in `livestream/webhook_events.py` (three nested `delete_room` blocks, two near-identical host-left branches), room page split into components (it was skipped in phase 2 on purpose), role flow.
- Also: unused `Q` import in `livestream/views.py`.

## 8. UI cleanup
Design tokens, shared components, loading/empty/error states, mobile, landing page. Presentation only.

## 9. Demo user
"Try as demo" button, seeded rooms/extracts/papers via a management command, SerpAPI usage cap/caching. Works locally; no deploy needed to build or test it.

## 10. Maintenance
GitHub Actions (lint, build, test), Docker, dependency updates.

## 11. README and portfolio polish
Screenshots/GIF, architecture diagram, license, setup docs (fix the port mismatch: the old Selenium tests used 4000, the app uses 8000). Leave a placeholder for the live link; phase 12 fills it in.

## 12. Deploy (final step)
Frontend on Vercel; backend + Postgres on Render or Railway; Firebase and LiveKit Cloud unchanged. Re-test Firebase (authorized domains must include the deployed URL), LiveKit and SerpAPI on the deployed environment. Add the live link to the README.
Production readiness list (collected from earlier phases):
- Django: `DEBUG=True`, `ALLOWED_HOSTS=*`, hardcoded QMUL CORS/CSRF origins, insecure cookie flags, disabled password validators, `DATABASE_PASSWORD` default; static files.
- `next.config.js`: wildcard CORS with credentials, `eslint.ignoreDuringBuilds`, the `localhost:8000` rewrite and its redundant second rewrite (`/api/livestream/token/:params*` is covered by `/api/:path*`).
- `.env.example` is missing `CROSSREF_EMAIL` and the `DATABASE_*` keys.
- `requirements.txt` is UTF-16, pins a `psycopg2-binary` that fails to build on Python 3.13, and includes selenium and debug-toolbar.
- `backend/.s2i/` (QMUL OpenShift script): keep or remove.
Done when: signup/login, paper search, extracts and a room all work on the live URL.

## Decisions
Settled choices; don't reopen without the user.
- Keep the stack: Django/DRF, Next.js 14, Firebase auth, LiveKit, SerpAPI, Postgres in production.
- Keep the features: auth/profile, paper search, extracts, rooms. No new features.
- Fix and clean up first; redesign only when clearly better and approved, built on the existing implementation.
- Core rebuild before polish; deployment is the very last step.
- Tests follow `docs/testing.md`: written first and watched failing, independent expected values, mocks only at external boundaries.
- The demo user (phase 9) is the one approved addition to the feature set; everything else stays no-new-features.
- Webhook signatures are verified with LiveKit's `WebhookReceiver` (phase 7).

## Parking lot
Out-of-scope findings go here with the phase they belong to.
