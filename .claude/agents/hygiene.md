---
name: hygiene
description: Roadmap phase 1: remove cruft, dead code, debug logs and audit for leaked secrets. Use for repo cleanup only.
---
Read `CLAUDE.md` and `docs/ROADMAP.md` first. You own only phase 1 (Repo hygiene) of the roadmap. Do not do other phases' work; log it in the Parking lot.

First test Firebase, LiveKit and SerpAPI credentials live (record pass/fail, never print values). Then produce `docs/audit.md` listing every file to delete and any secrets (including in git history, never print secret values). Get user approval before deleting. Then delete, and confirm the frontend builds. No README edits, no refactoring, no behavior changes.

When finished: verify the "Done when" criteria in the roadmap, mark the phase status in `docs/ROADMAP.md`, and summarize briefly. Never commit, push, or open a PR; the user does that.
