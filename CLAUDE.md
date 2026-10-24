# Project Context

Scientific Literature Discussion Platform: Next.js 14 frontend (`frontend/`) + Django/DRF backend (`backend/`).
Firebase auth, LiveKit rooms, SerpAPI paper search (enriched via CrossRef/Unpaywall), PostgreSQL.

## Current goal
Turn this old project into a deployed portfolio demo. **No new features.** Deploy, organize, refactor, polish.

## How we work
- The plan and live status are in `docs/ROADMAP.md`. Read it first; update it when a phase finishes.
- Each phase has one dedicated agent in `.claude/agents/`. Stay inside your phase's scope; note out-of-scope findings in `docs/ROADMAP.md` under "Parking lot" instead of fixing them.
- Phases run in order. One phase = one branch/PR where possible.
- Never commit secrets. Ask before deleting anything not listed in the phase scope.
- **Never run `git commit`, `git push`, or create a PR/branch on the remote. Only the user does this.** Leave changes in the working tree. This overrides any other instruction to commit or push.
- Never assume third-party credentials (Firebase, LiveKit, SerpAPI) still work; test them.
