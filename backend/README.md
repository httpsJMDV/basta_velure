# Velure — Backend API

Laravel REST API backend for **Velure**, a women's apparel e-commerce platform. This powers the React + TypeScript frontend via a versioned API (`/api/v1/...`).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Language | PHP 8.3 |
| Framework | Laravel 13 (latest LTS) |
| Authentication | Laravel Sanctum (SPA token auth) |
| Database | MySQL 8 (SQLite supported for local dev) |
| File Storage | Laravel filesystem (private disk for ID scans) |
| Image Processing | Intervention Image v4 |
| Mail | SMTP / Mailtrap (configurable via `.env`) |

---

## What's Built So Far

### Authentication & Identity
- Single `users` table covering all 4 roles: `admin`, `buyer`, `seller`, `rider`
- Buyer registration with email verification flow
- Seller registration with government ID upload (JPG/PNG/PDF, 5MB max, stored on private disk)
- Login / logout via Sanctum tokens
- Forgot password + reset password with signed token + expiry
- Google OAuth login (`/api/v1/auth/google`)
- Avatar upload with Intervention Image processing
- Profile update (phone, date of birth, gender)
- `role` and `status` are never mass-assignable — set explicitly in server-side code only

### Seller Registration & Verification
- `seller_profiles` table (1:1 with `users`, cascade-deletes with its user)
- Required fields: shop name, date of birth (18+ validated at submission), GCash payout number, government ID type + number + image scan
- `government_id_number` and `payout_gcash_number` encrypted at rest via Laravel's `Crypt` facade
- SHA-256 hash of ID number stored separately for duplicate detection without indexing plaintext
- Application status flow: `pending` → `approved` / `rejected`
- Sellers can log in immediately but every seller-only action independently checks `application_status === approved` server-side

### Admin Panel (API)
- Single admin account — seeded once, no public registration path
- Dashboard stats endpoint: pending seller/rider apps, total buyers/sellers/riders, orders today, open disputes
- Users list with search, role filter, status filter, pagination (20 per page)
- Suspend / reactivate any non-admin user (reversible, preserves history)
- Seller application queue: list, view detail, approve, reject (with reason)
- Admin-gated signed URL for viewing seller ID scan images (never publicly reachable)
- Admin Activity Log: every approval, rejection, suspension, reactivation logged with timestamp, actor, target, and structured metadata

### Addresses
- Multiple addresses per buyer, one marked default
- Full CRUD: create, update, delete, set default

### Security
- Rate limiting: 5 req/min per IP on auth endpoints, 10 req/min on file upload endpoints
- All inputs validated via Laravel Form Requests — client validation is never trusted alone
- SQL injection prevention: Eloquent/query builder exclusively, no raw queries with interpolated input
- Password policy: min 8 chars, mixed case, numbers, symbols, checked against Have I Been Pwned (`Password::uncompromised()`)
- PII (government ID number, image path) hidden by default on API responses
- Role middleware (`role:admin`) + Laravel Policies on every admin route
- `role` and `status` excluded from `$fillable` on the User model

---

## Database Schema (Migrations)

| Migration | Table |
|---|---|
| `0001_01_01_000000` | `users` |
| `0001_01_01_000001` | `cache` |
| `0001_01_01_000002` | `jobs` |
| `2026_08_12_164340` | `personal_access_tokens` (Sanctum) |
| `2026_08_12_164525` | `seller_profiles` |
| `2026_08_12_193559` | make `phone` nullable on `users` |
| `2026_08_12_193600` | `sessions` |
| `2026_08_12_210056` | add profile fields to `users` (DOB, gender) |
| `2026_08_12_210343` | `addresses` |
| `2026_08_12_215517` | add `avatar_path` to `users` |
| `2026_08_12_224456` | `admin_activity_logs` |

---

## API Routes

All routes are prefixed `/api/v1/`.

### Public (rate-limited: 5 req/min)
```
POST /auth/register              — Buyer registration
POST /auth/register/seller       — Seller registration (multipart/form-data)
POST /auth/login                 — Login → returns Sanctum token
POST /auth/forgot-password       — Send password reset email
POST /auth/reset-password        — Reset password with token
POST /auth/google                — Google OAuth login
```

### Authenticated (requires Bearer token)
```
POST   /auth/logout              — Revoke current token
GET    /auth/me                  — Get current user
PATCH  /auth/profile             — Update profile (phone, DOB, gender)
POST   /auth/avatar              — Upload avatar (rate-limited: 10 req/min)

GET    /addresses                — List addresses
POST   /addresses                — Create address
PATCH  /addresses/{id}           — Update address
DELETE /addresses/{id}           — Delete address
PATCH  /addresses/{id}/default   — Set as default
```

### Admin only (`role:admin` middleware)
```
GET    /admin/stats                                    — Dashboard stats
GET    /admin/users                                    — List users (search, filter, paginate)
PATCH  /admin/users/{id}/suspend                       — Suspend user
PATCH  /admin/users/{id}/reactivate                    — Reactivate user
GET    /admin/activity-log                             — Admin activity log
GET    /admin/seller-applications                      — List seller applications
GET    /admin/seller-applications/{id}                 — View single application
POST   /admin/seller-applications/{id}/approve         — Approve seller
POST   /admin/seller-applications/{id}/reject          — Reject seller (requires reason)
GET    /admin/seller-applications/{id}/id-image        — View ID scan (signed URL, auth-gated)
```

---

## Requirements

- PHP >= 8.3
- Composer
- MySQL 8.0+ (or SQLite for local dev)
- Node.js >= 18 (only needed if running Vite for the frontend)

---

## Local Setup

### 1. Clone and install dependencies
```bash
git clone <repo-url>
cd backend
composer install
```

### 2. Environment setup
```bash
cp .env.example .env
php artisan key:generate
```

### 3. Configure `.env`

At minimum, set your database connection:

```env
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=velure
DB_USERNAME=root
DB_PASSWORD=

# Or use SQLite for quick local dev:
# DB_CONNECTION=sqlite
# (leave DB_DATABASE blank — it will use database/database.sqlite)
```

Mail (use Mailtrap for local testing):
```env
MAIL_MAILER=smtp
MAIL_HOST=sandbox.smtp.mailtrap.io
MAIL_PORT=2525
MAIL_USERNAME=your_mailtrap_user
MAIL_PASSWORD=your_mailtrap_pass
MAIL_FROM_ADDRESS=noreply@velure.com
MAIL_FROM_NAME="Velure"
```

Frontend URL (for CORS and password reset links):
```env
FRONTEND_URL=http://localhost:5173
```

### 4. Run migrations and seed the admin account
```bash
php artisan migrate
php artisan db:seed --class=AdminSeeder
```

Admin credentials:
- **Email:** `admin@gmail.com`
- **Password:** `admin123`

### 5. Link storage (for public avatars)
```bash
php artisan storage:link
```

### 6. Start the dev server
```bash
php artisan serve
```

API will be available at `http://localhost:8000/api/v1/`.

---

## Next Steps (Not Yet Built)

The following sections are planned for upcoming build passes:

- **Categories** — 6 top-level product categories with `parent_id` for subcategories
- **Products & Variants** — per-variant stock tracking (size/color/SKU), product images
- **Cart & Checkout** — cart items, GCash and COD payment flow
- **Orders** — full order lifecycle (`pending` → `delivered`), order item snapshots
- **Payments** — GCash reference reconciliation, COD confirmation
- **Deliveries** — rider assignment, status updates, proof of delivery
- **Reviews & Wishlist** — verified-purchase reviews, per-buyer wishlists
- **Disputes / Returns** — buyer-initiated dispute flow
- **Rider Registration** — rider application queue (mirrors seller flow)
- **Seller Dashboard API** — seller's own products, orders, payouts
- **Platform Settings** — shipping fee rules, site banners, feature flags

---

## Project Structure

```
app/
├── Http/
│   ├── Controllers/Api/V1/     — Thin controllers (validate → service → resource)
│   ├── Middleware/             — Role middleware
│   ├── Requests/               — Form Request validation classes
│   └── Resources/              — API Resource classes (consistent JSON shape)
├── Models/                     — Eloquent models
├── Services/                   — Business logic (SellerRegistrationService, etc.)
└── Providers/

database/
├── migrations/                 — One file per table
└── seeders/                    — AdminSeeder (idempotent)

routes/
└── api.php                     — All API routes, versioned under /api/v1/

storage/
└── app/private/                — Government ID scans (never publicly reachable)
```
