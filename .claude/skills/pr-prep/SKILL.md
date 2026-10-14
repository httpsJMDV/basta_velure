---
name: pr-prep
description: Prepare the current feature branch for a pull request into main (merge main in, run checks, push). Never merges to main.
disable-model-invocation: true
---

Prepare the current branch for a PR. Do NOT merge into `main`, open or merge a PR, force push, reset --hard, clean, or delete branches. Stop and report if anything unexpected happens.

1. `git status`. Commit only untracked planning docs under `docs/` (with `git add docs/`). List anything else without committing it.
2. `git fetch origin`. List the commits on `origin/main` that this branch lacks (with authors) and `git diff --stat HEAD...origin/main`.
3. `git merge origin/main`. On conflicts, run `git merge --abort`, list the conflicting files with a summary of each side, and stop.
4. `php artisan migrate:status`. Report pending migrations and duplicate timestamps. Do NOT run migrate.
5. Run `php artisan test`, `npm run lint`, and `npm run build`. If anything fails, stop and report.
6. `git push origin <current branch>` (normal push).
7. Report everything above and print https://github.com/httpsJMDV/basta_velure/compare/main...<current branch>