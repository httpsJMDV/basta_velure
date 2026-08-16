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

## Step 1 — Create the Database

1. Open **MySQL Workbench** or any MySQL tool you have
2. Create a new database named exactly: `velure`
3. Leave it empty — the system will fill it automatically

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

**Run the database migrations (creates all tables):**
```bash
php artisan migrate
```

**Run the seeders (creates the admin account and sample data):**
```bash
php artisan db:seed
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
| Re-run migrations | `backend/` | `php artisan migrate:fresh --seed` |

---

## Common Issues

**"Could not connect to database"**
- Make sure MySQL is running (check XAMPP control panel)
- Double-check `DB_USERNAME` and `DB_PASSWORD` in `backend/.env`

**"npm: command not found"**
- Node.js is not installed or not added to PATH — reinstall from https://nodejs.org

**"composer: command not found"**
- Composer is not installed — download from https://getcomposer.org

**Frontend loads but API calls fail**
- Make sure the backend (`php artisan serve`) is still running in a separate terminal
- Check that `VITE_API_URL` in `frontend/.env` points to `http://localhost:8000`
