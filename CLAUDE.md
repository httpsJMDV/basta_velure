# Loved-IT (repo: basta_velure)

Shopee/Lazada-style Philippine marketplace (BSIT capstone). Roles: Admin, Buyer, Seller, Logistics/Sorting Center (hub), Rider/Courier. Web first; the mobile app starts only after the whole web app is finished.

## Stack and layout
- `backend/`: Laravel 11 REST JSON API at `/api/v1/*`, Sanctum tokens, MySQL 8, PHPUnit.
- `frontend/`: React 18 + TypeScript + Vite + Tailwind, Axios, React Context hooks.
- `docs/`: specs and API contracts. Read before building: `LOVED-IT_PROJECT_PLAN.md`, `ERP-Flow.pdf`, `ERP-Components-updated (2).pdf`, `order-lifecycle.md`, `address-standardization.md`, `api/*.md`.
- Dev machine is Windows (PowerShell) with local MySQL.

## Commands
- Backend tests: `cd backend; php artisan test`. They run against the separate `velure_test` database, pinned in `phpunit.xml` and enforced by a guard in `tests/TestCase.php` that aborts if the database name does not end in `_test`. One-time setup (create `velure_test`, then `$env:DB_DATABASE='velure_test'; php artisan migrate`) is in `SETUP.md`. Re-run that migrate after adding migrations.
- Migration state: `php artisan migrate:status` (this checks `velure`; add `$env:DB_DATABASE='velure_test'` to check the test database).
- Frontend: `cd frontend; npm run lint; npm run build`
A feature is not done until the full backend suite, lint, and build all pass.

## Hard rules
- Never run `migrate:fresh`, `migrate:refresh`, or `db:wipe`. Never edit or regenerate `backend/database/velure.sql`.
- Tests must never touch `velure`. Do not use `RefreshDatabase`, `DatabaseMigrations`, or call `migrate:fresh` in tests; use `DatabaseTransactions`. Do not weaken the `_test` guard in `tests/TestCase.php` or the DB settings in `phpunit.xml`.
- Never edit an existing migration. Add new additive migrations with timestamps after the latest one.
- Uploaded documents live on the private `ids` disk and are served only through authorized routes.
- Do not change money logic (amounts, 10% commission, 8% for Food & Grocery, escrow, payouts) unless asked.
- PSGC codes are strings (leading zeros matter). Codes are authoritative for matching; names are display text.
- Order status changes only through `OrderStateMachine` (`OrderStatus` enum). Never write `orders.status` directly.
- Do not push or merge to `main` unless asked.

## Git
- One branch per feature, named `jm/<feature>`, created from an up-to-date `main`.
- Conventional commits, one per part (backend, frontend).
- Pull requests are merged with a merge commit, not squash.

## How we build a feature
1. Inspect the existing code and report what you find before changing anything. Stop and ask if the spec conflicts with the code.
2. Backend first, then frontend. Reuse existing patterns and components. No new dependencies unless unavoidable (flag it).
3. Write PHPUnit tests. Update the matching `docs/api/*.md` contract when an endpoint changes.
4. Finish with a short report: files changed, decisions, test output.

## Domain decisions already made
- One order per seller: checkout splits a multi-shop cart into several orders (`checkout_group_id`).
- Seller marking Ready for Pickup creates a parcel with tracking number `LIT-YYMMDD-XXXXXX`. The waybill is a printable A6 page (browser print + jsbarcode).
- Parcel status mirrors order status through the logistics segment. Rider pickup requests are unclaimed `READY_FOR_PICKUP` parcels whose pickup barangay code is in the rider's active areas.
- Payments: GCash and COD only, with manual/simulated escrow. Escrow release fires at DELIVERED for now (TODO(2.8): move to COMPLETED when buyer confirm-receipt exists).

## Status (Oct 14, 2026): verify against `git log origin/main` and `docs/`
Done and merged to `main`: hub registration, admin approval, hub dashboard, rider vetting and area assignment (1.1 to 1.5); rider tables, registration, login and shell (2.1 to 2.3); order lifecycle state machine; one-order-per-seller checkout; parcels, tracking numbers and waybill; PSGC address standardization; 2.4 rider pickup dashboard (PR #12, `b9963fb`: list/accept/decline/release endpoints, `RiderPickupsPage`, `docs/api/rider-pickups.md`).
Unmerged: nothing. Every `origin/jm/*` branch and `origin/maru` is already contained in `origin/main`; the old branches are stale and can be deleted when you choose. Local `main` may lag `origin/main`, so `git fetch` first.
Next, in order: 2.5 pickup execution (scan/confirm, PICKED_UP) → 1.6 hub intake scan → 1.7 sorting by barangay → 1.8 dispatch by area → 2.6 rider delivery console → 2.7 delivered/failed outcomes → 1.9 delivery monitoring and return-to-seller → 2.8 buyer confirm receipt + escrow trigger → 2.9 rider earnings and history → 2.10 rider chat/account → 1.10 hub reports → mobile.

## Parked issues
- Payment proof images are stored on the public disk; move them to the private disk.
- Check that unauthenticated requests to admin document routes return 401 (one once returned 500).
- `velure.sql` is stale (missing newer tables); setup must run `php artisan migrate`.
- A rider whose hub is suspended can still use rider routes.
- Sellers cannot request a pickup time slot (not built).