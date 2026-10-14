---
name: status-sync
description: Verify the Status section of CLAUDE.md against git and the real code, then report corrections. Use at the start of a session or after a PR merges.
disable-model-invocation: true
---

Read-only check, then correct only the Status section of CLAUDE.md if the user agrees or has said to just fix it.

1. `git fetch origin`, then compare `main` to `origin/main` (local main is often stale).
2. `git log --oneline -40 origin/main` and `git branch -r --no-merged origin/main` to list what is merged and what is not.
3. For each "Done" or "In progress" item, find evidence in code or `docs/api/*.md` (routes in `backend/routes/api.php`, pages in `frontend/src/pages`, tests in `backend/tests/Feature`). Say "unverified" when you cannot find it.
4. Check whether the next feature already has code, a branch, or a placeholder route.
5. Report: confirmed items, wrong items, stale branches, and the exact text you would change. Do not touch code.
