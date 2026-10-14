# Loved-IT — Local Setup Guide

This guide will walk you through running the Loved-IT system on your own computer for checking/testing purposes.

---

## What You Need to Install First

Make sure you have all of these installed before starting:

| Tool | Version | Download |
|------|---------|----------|
| PHP | 8.2 or higher | https://www.php.net/downloads |
| Composer | Latest | https://getcomposer.org |
| Node.js | 18 or higher | https://nodejs.org |
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

> The SQL file already contains all tables, the admin account, and any seed data — no need to run migrations or seeders separately.

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

- `orders:auto-complete` completes a delivered order the buyer never confirmed (after 3 days).
- `payouts:release-due` makes a seller's earnings available once the 7-day protection period after completion has ended.

**The scheduler must be running, or neither happens and sellers are never paid.**

- **Development:** in a separate terminal, from `basta_velure/backend`:
  ```powershell
  php artisan schedule:work
  ```
- **Production:** add one cron entry that runs every minute:
  ```
  * * * * * cd /path/to/basta_velure/backend && php artisan schedule:run >> /dev/null 2>&1
  ```

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

Remove the two lines (or set 7 and 3) for normal use. Emails use the queue as before; keep `php artisan queue:work` running if `QUEUE_CONNECTION=database`.

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
