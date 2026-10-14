# Loved-IT (repo: basta_velure)

Shopee/Lazada-style Philippine marketplace (BSIT capstone). Roles: Admin, Buyer, Seller, Logistics/Sorting Center (hub), Rider/Courier. Web first; the mobile app starts only after the whole web app is finished.

## Stack and layout
- `backend/`: Laravel 13 REST JSON API at `/api/v1/*`, Sanctum tokens, MySQL 8, PHPUnit.
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
- After adding a migration, run it on BOTH databases: `php artisan migrate` (velure), then `$env:DB_DATABASE='velure_test'; php artisan migrate; Remove-Item Env:DB_DATABASE` (velure_test). Tests only see the new columns once `velure_test` is migrated.
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
- Payments: GCash and COD only, with manual/simulated escrow. Escrow is scheduled at COMPLETED (buyer confirms receipt, or auto-complete) and released by the hourly `payouts:release-due`; see `docs/order-lifecycle.md` sections 4 and 15.

## Status (Oct 14, 2026): verify against `git log origin/main` and `docs/`
Done and merged to `main`: hub registration, admin approval, hub dashboard, rider vetting and area assignment (1.1 to 1.5); rider tables, registration, login and shell (2.1 to 2.3); order lifecycle state machine; one-order-per-seller checkout; parcels, tracking numbers and waybill; PSGC address standardization; 2.4 rider pickup dashboard (PR #12); 2.5 rider pickup execution (PR #13); 1.6 hub parcel intake (PR #14); 1.7 hub area sorting (PR #15); test database isolation (PR #16); 1.8 hub dispatch with the 1.7 follow-ups (PR #17); the 1.6 intake fixes (PR #18); 2.6 rider delivery console (PR #19); 2.7 rider delivery outcomes (PR #20: delivered with private photo proof and COD confirmation, or failed with a reason; `docs/api/rider-delivery-outcomes.md`); 1.9 hub delivery monitoring and failure triage (PR #21: live out-for-delivery board, failed deliveries, reschedule or return to seller; max 3 attempts via `config/logistics.php`; `docs/api/logistics-hub-deliveries.md`), plus client-side proof photo downscaling.
Also merged: 2.8 buyer confirms receipt and the escrow rule (PR #22, `docs/api/buyer-confirm-receipt.md`). Escrow no longer releases at DELIVERED: it is scheduled at COMPLETED (`payouts.escrow_hold_days`, default 7) and released by `payouts:release-due`; unconfirmed orders complete by themselves after `orders.auto_complete_days` (default 3) via `orders:auto-complete`. Both run hourly, so the scheduler (`php artisan schedule:work`, or cron in production) must be running. Only the timing changed: amounts, commission, payout requests and disbursement are untouched. Refunds for RETURNED or cancelled orders and the review feature are still not built.
Also merged: 2.9 rider earnings and delivery history (PR #23; `docs/api/rider-earnings.md`, `docs/order-lifecycle.md` section 16). A flat fee per delivered parcel (`RIDER_DELIVERY_FEE`, default 50.00) is snapshotted on a `rider_earnings` row when an order enters DELIVERED (any actor, one row per parcel via a unique index, no clawback on return, failed deliveries earn nothing, no rider payouts). `GET /rider/earnings/summary`, `/rider/earnings/deliveries` and `/rider/history`; reports use Asia/Manila with Monday to Sunday weeks. RETURNED history is derived from `parcels.returned_at` because the return action writes no delivery log. Run `php artisan riders:backfill-earnings` once after deploying to give earlier deliveries a row. Frontend: `RiderEarningsPage` (Earnings and History tabs, no chart library).
Done on branch `king/rider-chat-account`, not yet merged: the `/api/*` guest fix and 2.10 rider chat and account. Every `/api/*` route now answers a guest with a JSON 401 even without an `Accept` header (it used to be a 500 "Route [login] not defined", `bootstrap/app.php` `redirectGuestsTo`). 2.10 (`docs/api/rider-chat-account.md`, `docs/order-lifecycle.md` section 17, `MESSAGES_DOCUMENTATION.md` section 7): rider delivery threads reuse `conversations` and `messages` (types `rider_seller`, `rider_buyer`, `rider_hub`, one thread per parcel, rider and counterpart). The seller and buyer use the existing `/conversations` endpoints; the rider uses `/rider/chat/*` and the hub `/hub/chat/*`. A thread is open only while the parcel is active for that rider (computed from the parcel on every request): seller during `READY_FOR_PICKUP`/`PICKED_UP`, buyer during `ASSIGNED_TO_RIDER`/`OUT_FOR_DELIVERY`, hub in both; afterwards it is read-only (send returns 409). Plain text, 1000 characters, 20 sends per minute, names only, admins cannot read these threads. `PUT /rider/vehicle` edits type and plate immediately with no new OR/CR and no hub re-approval (a known gap, flagged in the docs). Frontend: Message control and bottom sheet on rider stop cards, `RiderAccountPage`, `HubMessagesPage` at `/hub/messages`, and rider threads in the buyer and seller inboxes; the rider and hub poll every 3 seconds while a conversation is open, the buyer and seller keep their websocket channel.
Unmerged elsewhere: nothing. Every other `origin/*` branch is fully contained in `main`. Local `main` may lag `origin/main`, so `git fetch` first.
Next, in order: 1.10 hub reports → mobile.

## Parked issues
- Payment proof images are stored on the public disk; move them to the private disk.
- `velure.sql` is stale (missing newer tables); setup must run `php artisan migrate`.
- A rider whose hub is suspended can still use rider routes.
- Sellers cannot request a pickup time slot (not built).
- A vehicle edit (2.10) is not re-verified: no new OR/CR and no hub re-approval, and nothing flags the change for the hub.
- A grouped pickup card opens its chat on the group's first parcel, so a seller with several parcels in one pickup can end up with one thread per parcel.
- Two older chat routes point at controller methods that do not exist: `GET /my-conversation` (`ConversationController::mine`) and `GET /admin/conversations/seller/{seller}` (`openForSeller`).