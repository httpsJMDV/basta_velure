# Velure — Local Setup Guide

This guide will walk you through running the Velure system on your own computer for checking/testing purposes.

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

**Open the `.env` file and update these lines to match your MySQL setup:**
```
DB_DATABASE=velure
DB_USERNAME=root
DB_PASSWORD=your_mysql_password
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

## Step 3 — Set Up the Frontend (React)

Open a **new terminal** (keep the backend one running) and go into the frontend folder:

```bash
cd basta_velure/frontend
```

**Install Node dependencies:**
```bash
npm install
```

**Start the frontend:**
```bash
npm run dev
```

The frontend will run at: **http://localhost:5173**

---

## Step 4 — Open the System

Open your browser and go to:

```
http://localhost:5173
```

You should see the Velure homepage.

---

## Default Admin Account

The admin account is pre-created by the seeder. Use these credentials to log in as admin:

```
Email:    admin@velure.ph
Password: Admin@1234
```

> Change the password after logging in if needed.

---

## Quick Recap — Terminal Commands

| What | Folder | Command |
|------|--------|---------|
| Start backend | `backend/` | `php artisan serve` |
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

**"The storage/app/public" path is not accessible"**
- Run `php artisan storage:link` inside the `backend/` folder

**"npm: command not found"**
- Node.js is not installed or not added to PATH — reinstall from https://nodejs.org

**"composer: command not found"**
- Composer is not installed — download from https://getcomposer.org

**Frontend loads but API calls fail**
- Make sure the backend (`php artisan serve`) is still running in a separate terminal
- Check that `VITE_API_URL` in `frontend/.env` points to `http://localhost:8000`
