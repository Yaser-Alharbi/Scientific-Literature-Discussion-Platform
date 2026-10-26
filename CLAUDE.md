# Project Context

Scientific Literature Discussion Platform: Next.js 14 frontend (`frontend/`) + Django/DRF backend (`backend/`).
Firebase auth, LiveKit rooms, SerpAPI paper search (enriched via CrossRef/Unpaywall), PostgreSQL.

## Current goal
Turn this old project into a deployed portfolio demo. **No new features.** Fix and rebuild the core (same stack and features), then polish; **deployment is the very last step.**
Fix and clean up first; redesign a piece only when clearly better and approved by the user, and build redesigns on the existing implementation.

## How we work
- The plan and live status are in `docs/ROADMAP.md`. Read it first; update it when a phase finishes.
- Each phase has one dedicated agent in `.claude/agents/`. Stay inside your phase's scope; note out-of-scope findings in `docs/ROADMAP.md` under "Parking lot" instead of fixing them.
- Phases run in order.
- Never commit secrets. Ask before deleting anything not listed in the phase scope.
- Each phase gets its own branch, cut from up-to-date `cleanup` and named `phase-<n>-<slug>`: `phase-3-tooling`, `phase-4-foundations`, `phase-5-papers`, `phase-6-extracts`, `phase-7-rooms`, `phase-8-ui`, `phase-9-demo-user`, `phase-10-maintenance`, `phase-11-readme`, `phase-12-deploy`. Commit and push to that branch only; never to `cleanup` or `main` directly. Never open or merge PRs: the user opens the PR into `cleanup`, reviews and merges it, and the phase's `[x]` in `docs/ROADMAP.md` goes in that PR. Start the next phase only after the previous one is merged.
- Commits are authored by Yaser <yaser.e.alharbi@gmail.com>; Claude appears only as a `Co-Authored-By` trailer, never as sole author.
- Write every commit message with the `/anthropic-skills:commit-msg` skill; its "no AI attribution" line doesn't apply to the `Co-Authored-By` trailer.
- Never assume third-party credentials (Firebase, LiveKit, SerpAPI) still work; test them.
- Don't upgrade frameworks or dependencies unless the phase explicitly says so.

## Environment setup
- Install from existing manifests only: `cd frontend && npm ci`; `pip install -r backend/requirements.txt`. Adding or upgrading packages needs approval.
- Start PostgreSQL per session if a check needs it.

## Code changes
- Smallest diff that solves the task. No drive-by refactors, renames or reformatting.
- One concern per change; never mix refactor with behaviour change.
- Reuse existing helpers and patterns; search before writing new ones.
- No new dependencies, abstractions or config options without approval.
- No dead code, commented-out code, TODOs or placeholder stubs.
- Handle errors at boundaries (views, API clients), not with blanket try/except.
- Comments explain why, not what.
- Never invent APIs; check the installed version.
- Never edit tests just to make them pass.

## Workflow per task
1. Read the relevant code and `docs/ROADMAP.md`.
2. State a short plan; wait for approval if it touches more than 3 files or ~100 lines.
3. Before refactoring, add or confirm tests that pin current behaviour.
4. Implement, then run the Definition of done.
5. Report: what changed and why, files touched, checks run, parking-lot entries.

Stop and ask if scope is unclear, a fix needs out-of-scope changes, or a failure can't be explained.

## Definition of done
- Frontend (`frontend/`): `npm run lint` (baseline ratchet, inline disables ignored) · `npm run typecheck` · `npm run build` (needs the `NEXT_PUBLIC_*` variables from `.env.example`; placeholders are enough)
- Backend (`backend/`, Python 3.12): `python manage.py test` (network blocked; Selenium suite runs only with `RUN_SELENIUM=1`) · `python manage.py makemigrations --check --dry-run`
- When changing tested production code: `python scripts/mutation_check.py mutations/<phase>` must report no stale or invalid patches. A changed behavior starts with a failing test.
All available checks must pass and actually be run.

## Architecture
- Auth: Firebase ID token sent by frontend → verified in DRF by `FirebaseAuthentication` in `backend/authentication/authentication.py` (`auth.verify_id_token`).
- LiveKit: room tokens issued by backend at `GET /api/livestream/rooms/<room_id>/token/` (`get_room_token` in `backend/livestream/views.py`); frontend never holds the API secret.
- Paper search: SerpAPI called from `search_scholar` in `backend/papers/views.py`, enriched via CrossRef/Unpaywall in `backend/papers/services.py` (`enrich_results_with_doi`, `enrich_results_with_unpaywall`); SerpAPI results not cached (see Parking lot); CrossRef/Unpaywall lookups cached in Django's default per-process locmem cache.
- Frontend never calls third-party APIs that need secret keys.

## Project risks
- SerpAPI is paid and rate-limited: cache results, never call it in loops, always mock it in tests.
- CrossRef/Unpaywall: send a contact email, respect rate limits.
- Migrations: never edit applied migrations; destructive migrations need approval.
- Config via env only; keep `.env.example` in sync with every new variable.

## Decisions
Settled choices live in `docs/ROADMAP.md` under "Decisions". Don't reopen them without the user.
