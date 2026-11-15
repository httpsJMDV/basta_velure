# Loved-IT — Local Setup Guide

This guide will walk you through running the Loved-IT system on your own computer for checking/testing purposes.

---

## What You Need to Install First

Make sure you have all of these installed before starting:

| Tool | Version | Download |
|------|---------|----------|
| PHP | 8.3 or higher | https://www.php.net/downloads |
| Composer | Latest | https://getcomposer.org |
| Node.js | 22.12 or higher | https://nodejs.org |
| MySQL | 8.0 or higher | https://dev.mysql.com/downloads/mysql |
| Git | Latest | https://git-scm.com |

> **Note on Real-time WebSockets (Laravel Reverb):** You **do not** need to download an external installer for Reverb. It is a native PHP package (`laravel/reverb`) bundled into `composer.json` and gets installed automatically when running `composer install`.

---

## Step 1 — Create and Import the Database

1. Open **MySQL Workbench** (or any MySQL client)
2. Run this query to create the database:
   ```sql
   CREATE DATABASE IF NOT EXISTS velure CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```
3. Select the `velure` database, then go to **Server → Data Import**
4. Choose **Import from Self-Contained File** and select the file:
   ```
   basta_velure/backend/database/velure.sql
   ```
5. Set **Default Target Schema** to `velure`
6. Click **Start Import**

> The SQL file is a historical snapshot. After importing it, run `php artisan migrate` from `backend/` to apply newer schema changes. Do not re-import it over an existing installation.

---

## Step 2 — Set Up the Backend (Laravel API)

Open a terminal and go into the backend folder:

```bash
cd basta_velure/backend
```

**Install PHP dependencies:**
```bash
composer install
```

**Copy the environment file:**
```bash
cp .env.example .env
```

**Open the `.env` file and update these lines to match your MySQL and Reverb setup:**
```
DB_DATABASE=velure
DB_USERNAME=root
DB_PASSWORD=your_mysql_password

BROADCAST_CONNECTION=reverb
REVERB_APP_ID=533356
REVERB_APP_KEY=xyarqae6lv3xk9x9ruyv
REVERB_APP_SECRET=caa9wkhgi6xi2qi0opfs
REVERB_HOST=localhost
REVERB_PORT=8080
REVERB_SCHEME=http
```

**Generate the app key:**
```bash
php artisan key:generate
```

**Create the storage symlink (for uploaded files like ID images):**
```bash
php artisan storage:link
```

**Start the backend server:**
```bash
php artisan serve
```

The backend will run at: **http://localhost:8000**

---

## Step 3 — Start the WebSocket Server (Laravel Reverb)

> **About Laravel Reverb:** Reverb is Laravel's first-party WebSocket server that powers Loved-IT's real-time messaging, order notifications, live chat, and dashboard pulse updates.
>
> 💡 **Do you need to download a separate installer for Reverb?**
> **No.** Reverb is a PHP Composer package (`laravel/reverb`) already included in `backend/composer.json`. It is automatically downloaded and installed when you run `composer install` in Step 2.

Open a **separate terminal window** (keep `php artisan serve` running in the other) and start the Reverb WebSocket server:

```bash
cd basta_velure/backend
php artisan reverb:start
```

*(Optional / Troubleshooting: If `php artisan reverb:start` says the command is not recognized, run `composer require laravel/reverb` or `php artisan reverb:install` to initialize its configuration).*

> **Note:** The Reverb server must stay running in its own terminal window on port `8080` so messages, read receipts, and live inbox notifications appear instantly in real-time.

### Start the queue worker (emails)

Every email (welcome, application decisions, orders, payments, returns, payouts) is queued. With
`QUEUE_CONNECTION=database` nothing is sent until a worker runs, so keep this open in its own terminal too:

```bash
cd basta_velure/backend
php artisan queue:work --tries=3
```

Emails queued while the worker was off are sent as soon as it starts. Check what is waiting with
`php artisan tinker --execute="echo DB::table('jobs')->count();"`.

---

## Step 4 — Set Up the Frontend (React)

Open a **new terminal** (keep both backend terminals running) and go into the frontend folder:

```bash
cd basta_velure/frontend
```

**Install Node dependencies:**
```bash
npm install
```

**Confirm your `frontend/.env` file has these WebSocket variables configured:**
```
VITE_API_URL=http://localhost:8000/api/v1
VITE_REVERB_APP_KEY=xyarqae6lv3xk9x9ruyv
VITE_REVERB_HOST=localhost
VITE_REVERB_PORT=8080
VITE_REVERB_SCHEME=http
```

**Start the frontend:**
```bash
npm run dev
```

The frontend will run at: **http://localhost:5173**

---

## Step 5 — Open the System

Open your browser and go to:

```
http://localhost:5173
```

You should see the Loved-IT homepage.

---

## Default Admin Account

The admin account is pre-created by the seeder. Use these credentials to log in as admin:

```
Email:    admin@loved-it.ph
Password: Admin@1234
```

> Change the password after logging in if needed.

---

## The Scheduler (needed for order completion and seller payouts)

Two things happen automatically, once an hour, through Laravel's scheduler:

- `orders:auto-complete` completes a delivered order the buyer never confirmed (after 7 days by default).
- `payouts:release-due` releases held platform earnings after the configured protection period. The default hold is 0 days; use `PAYOUT_ESCROW_HOLD_DAYS` to add a hold.

**The scheduler must be running, or neither happens and sellers are never paid.**

- **Development:** in a separate terminal, from `basta_velure/backend`:
  ```powershell
  php artisan schedule:work
  ```
- **Production:** add one cron entry that runs every minute:
  ```
  * * * * * cd /path/to/basta_velure/backend && php artisan schedule:run >> /dev/null 2>&1
  ```

**Check that it is running:** the scheduler writes a heartbeat every minute. Run

```powershell
php artisan scheduler:check
```

It says the scheduler is running, or fails (exit code 1) and tells you how to start it. Run it after deploying and whenever sellers say they are not being paid. It needs a cache that persists between processes (the default `CACHE_STORE=database` is fine).

**Demos:** to see the whole flow quickly, set these in `backend/.env`, then restart the server:

```
PAYOUT_ESCROW_HOLD_DAYS=0
ORDER_AUTO_COMPLETE_DAYS=0
```

and run the two commands by hand instead of waiting for the hour:

```powershell
php artisan orders:auto-complete
php artisan payouts:release-due
```

Remove the two lines (or set hold 0 and auto-complete 7) for normal use. Emails use the queue as before; keep `php artisan queue:work` running if `QUEUE_CONNECTION=database`.

---
## PHP Upload Limits (needed for delivery proof photos)

Riders upload a photo as proof of delivery, and the API accepts photos up to **8 MB**. PHP's default `upload_max_filesize` is only **2M**, so a normal phone photo (often 3 to 6 MB) is refused by PHP itself and the rider sees "The proof photo failed to upload."

In your `php.ini` (find it with `php --ini`), set:

```ini
upload_max_filesize = 8M
post_max_size = 10M
```

Then restart `php artisan serve` (or your web server). Check with `php -r "echo ini_get('upload_max_filesize');"`.

---

## Running the Tests (for developers)

The automated tests **never** use your `velure` database. They run against a separate database called `velure_test`, because some tests rewrite data. This is enforced twice: `backend/phpunit.xml` pins the database to `velure_test`, and a guard in `backend/tests/TestCase.php` aborts the whole run if the active database name does not end in `_test`.

**One-time setup**

1. In MySQL Workbench, run:
   ```sql
   CREATE DATABASE IF NOT EXISTS velure_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```
2. Create its tables (PowerShell, from `basta_velure/backend`):
   ```powershell
   $env:DB_DATABASE='velure_test'; php artisan migrate; Remove-Item Env:DB_DATABASE
   ```
   Repeat this command whenever you pull new migrations.

**Run the tests**
```powershell
cd basta_velure/backend
php artisan test
```

**If you see "Refusing to run the tests"**, the active database is not a `_test` database. Check `DB_DATABASE` in `backend/phpunit.xml` (it must be `velure_test`) and that you did not edit the guard. Never work around it by pointing the tests at `velure`.

---

## Quick Recap — Terminal Commands

| What | Folder | Command |
|------|--------|---------|
| Start backend | `backend/` | `php artisan serve` |
| Start websocket server | `backend/` | `php artisan reverb:start` |
| Send queued emails | `backend/` | `php artisan queue:work --tries=3` |
| Run hourly jobs (escrow, auto-complete) | `backend/` | `php artisan schedule:work` |
| Start frontend | `frontend/` | `npm run dev` |
| Re-link storage | `backend/` | `php artisan storage:link` |

---

## Common Issues

**"Could not connect to database"**
- Make sure MySQL is running (check XAMPP control panel)
- Double-check `DB_USERNAME` and `DB_PASSWORD` in `backend/.env`

**"Table doesn't exist" or "Unknown column" errors**
- The SQL import may have been incomplete — re-import `velure.sql` from scratch
- Make sure you selected `velure` as the target schema before importing

**"Messages don't appear in real time"**
- Make sure `php artisan reverb:start` is running in its own terminal
- Double-check that `VITE_REVERB_APP_KEY`, `VITE_REVERB_HOST`, and `VITE_REVERB_PORT` in `frontend/.env` match the `REVERB_*` credentials in `backend/.env`

**"The storage/app/public" path is not accessible"**
- Run `php artisan storage:link` inside the `backend/` folder

**"npm: command not found"**
- Node.js is not installed or not added to PATH — reinstall from https://nodejs.org

**"composer: command not found"**
- Composer is not installed — download from https://getcomposer.org

**Frontend loads but API calls fail**
- Make sure the backend (`php artisan serve`) is still running in a separate terminal
- Check that `VITE_API_URL` in `frontend/.env` points to `http://localhost:8000/api/v1`


## Commerce workflows (November 16, 2026)

After pulling updates, run `php artisan migrate` in `backend/`, rebuild the web frontend with `npm run build`, and rebuild the mobile app. The warranty update adds nullable `warranty` columns to products and order items through `2026_11_16_120000_add_product_warranty_terms`; existing orders stay unchanged. Payout receipt columns already exist in the platform GCash migration. Restart long-running queue workers after deployment (`php artisan queue:restart`).

### Platform GCash collection and refunds

Set `GCASH_COLLECTION_MODE=platform` in the backend environment and configure the Loved-IT collection name and number under Admin > Payments > Collection account before accepting platform GCash checkouts. The collection account snapshot on each order determines who handles its refund; changing the mode does not rewrite older direct-payment orders.

An approved return opens a pending refund; it does not send money. The buyer supplies a GCash account. Admin > Disputes > Refunds > Needs you now includes platform refunds waiting to be sent and sent refunds waiting for confirmation. The admin sends the money manually, records the 13-digit reference and a receipt, and the buyer confirms receipt or reports a missing transfer. A reviewed missing transfer can be sent again with a new reference; earlier transfer details remain in the case history. Platform refunds are not automatically counted as received by the deadline job.

Keep `php artisan schedule:work` running in development (or the production cron above). Return and refund deadlines are processed every 15 minutes. Keep the queue worker running for notifications by email.

### Seller payouts and commission

Platform-collected GCash order items use their saved category commission rate. The category commission and seller-funded shipping are deducted from the seller earnings before they become available; requesting a payout does not deduct commission again. Cancelled and returned orders do not earn a payout. Direct GCash and COD use direct settlement: the courier settles collected COD with the shop, and category commission is billed through monthly statements. These direct funds are not also available as platform payout balance.

For a platform payout, the admin must record a 13-digit transfer reference and a JPG, PNG or WebP receipt (up to 8 MB), then complete the request after checking receipt of funds. Sellers and admins can open the private receipt from payout history. A payout already sent cannot be rejected back into available balance. The existing private `ids` storage disk must persist across deployments; do not expose receipt folders publicly. PHP upload limits must allow these uploads (see above).

### Buyer risk review and reverse logistics

High-value orders now enter the default buyer risk queue at `ORDER_HIGH_VALUE_MIN` (default PHP 50,000, shared with the checkout agreement). The review covers the last 30 days and excludes cancelled, returned, and deleted high-value orders. Value is a manual review signal, not proof of fraud and does not automatically cancel an order. No backfill command is needed because the queue reads existing order data.

Approved item returns use the existing courier flow: local rider collection with proof; for different hubs, buyer-side hub to shop-side hub through the network; then a local rider delivers to the seller, who confirms receipt. Nearby same-hub returns can go straight to the shop. Keep original parcel hub-stop history intact so returns can identify the shop-side hub.

Confirming delivery closes the standard in-app return/refund request. Applicable warranties and consumer remedies remain available through the seller or Loved-IT support. The web terms and mobile Policies screen explain this distinction.


### Seller-defined warranties

Sellers set warranty terms per product under Seller > Products > Add/Edit > Warranty and after-sales support on the web. In the mobile seller Products screen, tap a product and use Save warranty. Specify the provider, duration/start date, coverage/exclusions, and claim steps (up to 2,000 characters). The buyer sees these terms on the product and a saved copy on each newly purchased order item. Later listing changes do not rewrite purchased terms. Existing orders are not backfilled from today's listing; use the original receipt or agreement for older purchases. Warranty help goes through the shop and Loved-IT support and does not reopen the standard return window automatically.

### Where admin vouchers appear

Create a platform or shipping voucher in Admin > Vouchers and select Claimable. While its date window is active and the total use limit is not exhausted, it appears in the Loved-IT vouchers section on web and mobile Home and in the buyer voucher collection screen. Buyers save it and choose it at checkout. Code only intentionally stays private and must be shared by code. Scheduled, ended and exhausted offers are not advertised. Web Home lets signed-in buyers claim directly; guests are directed to sign in.

### Truck-driver operations and rider payment

Drivers see the current trip, manifest (including buyer returns and return-to-sender parcels), receiving-hub address/phone, dispatch ETA when set, expected trip pay, arrival confirmation and hub scan progress. Drivers can report a delay, vehicle issue, parcel/handover issue or other problem. Reports notify courier staff and both hubs and appear in their activity feeds. A report never completes a trip or changes pay. Only the assigned driver can report on an ongoing trip; duplicate reports within five minutes are rejected. Finished trips continue to use receiving-hub scans or a courier decision to close a trip with missing parcels.

The courier company pays earned rider shares and finished truck-trip pay manually to the staff member's saved GCash and records a transfer reference in its portal. Riders review their GCash under Account. Riders now request their available earned balance through the mobile app; their own hub or courier can record a manual GCash payment. No automatic GCash transfer is made. Any employment salary or cash payment arrangement is separate from the parcel/trip earnings tracked here. Contact the courier for payment timing.


### Rider and truck-driver payment requests

Run `php artisan migrate` to apply `2026_11_16_140000_create_rider_payment_requests`. It creates the request ledger and links reserved rider earnings and truck trips to each request. Rebuild the web frontend and mobile app after updating the API. The private `ids` disk must persist and PHP must accept receipt uploads up to 8 MB.

**Rider mobile workflow:** open Earnings (delivery riders) or Trips (truck drivers), check the available balance and saved GCash, and tap Request payment. The confirmation shows the full available amount and account. Requests include earned pickup/delivery shares and finished unpaid truck trips in the rider's courier network; ongoing trips, already paid amounts and amounts reserved in another request are excluded. This is a request for tracked earnings, not a separately calculated employment salary. If the amount or account changes before submission, refresh and confirm again.

**Hub or courier mobile workflow:** More > Rider payment requests opens a dedicated queue. Requests are also shown under the hub Earnings and courier Settlements and pay screens. Both parties see the same request; the hub sees its own branch's requests, and the courier sees its company's requests. Tap Take request first. This assigns the pending request to one staff member before transfer instructions open, so another hub or courier user cannot also process it. Check the saved account and earnings breakdown, send the amount manually in GCash, then attach the actual receipt, enter its 13-digit reference and confirm the transfer. The assignee can resume recording after an interrupted upload. Release assignment is available only to the assignee while the request is pending and requires confirmation that no funds were sent; assignments do not expire automatically. The app records proof; it does not move money itself.

**Web workflow:** Rider Earnings / Trips > Request payment; Hub Earnings > Rider payment requests; Courier Settlements & pay > Payment requests. Web status dropdowns use CustomSelect.tsx.

The request moves from Pending to Sent / awaiting rider confirmation to Received. The rider can open the private receipt and tap I received it after checking GCash, or report a missing payment. Reported payments remain open for the hub/courier to review; they are not automatically marked received or made available for another payment. The rider can confirm after the money arrives. Do not send a second transfer while reconciling a reported payment without verifying what actually happened.

Only one open request is allowed per rider. It reserves exact earning/trip rows, so later earnings stay separate. A request declined before sending requires a reason and releases its unpaid rows for another request. Sent requests cannot be declined back into the balance. Hub and courier processing uses the same locked record, and the older bulk-pay tools skip reserved rows. GCash references cannot be reused across requests or existing rider/trip payment records within the same courier. Request, transfer, confirmation and issue events appear in activity logs and relevant actions notify the rider, home hub and courier.

Existing paid earnings and trips are preserved. No backfill is needed; unpaid eligible earnings can be requested after the migration.
