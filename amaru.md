# Amaru — Loved-IT tasks

Updated October 20, 2026. Tick each box when it's done and checked in the browser.

## Ground rules

- Keep each area's **color theme**. The design must look hand-made, not like a generic AI template.
- Reuse the existing components and styles before making new ones.
- Follow `CLAUDE.md`: never reset the database, add migrations instead of editing old ones, and run the backend tests, `npm run lint` and `npm run build` before calling a task done.
- For how each feature is supposed to work, see `HOW_IT_WORKS.md` and the role guides in `guides/`.

---

## 1. Buyer pages: find and fix bugs

Check every buyer page for bugs, and check that each form only accepts valid input (the same rules the server uses).

Pages to check (`frontend/src/pages/`):

- [ ] Home, search and category (`CatalogPage.tsx`)
- [ ] Product page (`ProductDetailPage.tsx`): variants, quantity, Add to cart, Buy now, flash sale reminder
- [ ] Cart (`CartPage.tsx`) and Checkout (`CheckoutPage.tsx`): addresses, vouchers, notes, all 4 payment methods, GCash reference and receipt
- [ ] Payment page (`PaymentPage.tsx`): pay, Pay again, the 1-hour limit
- [ ] Account pages (`SettingsPage.tsx`): Profile, Addresses, Orders, Returns, Cancellations, My vouchers, Reviews, Wishlist & stores, Messages
- [ ] Sign up, sign in, email code, forgot password

For each form:

- [ ] Wrong input shows a clear message under the field (empty, too long, wrong format).
- [ ] The browser checks match the server rules (see section 13 of `HOW_IT_WORKS.md`).
- [ ] Every button does what it says, with no console errors.
- [ ] Each page works at phone width.

Write down what you found and what you fixed.

## 2. Courier portal: add Settings and Messages pages

The courier portal (`/logistics`, `frontend/src/pages/logistics/`) has no Settings or Messages page.

- [ ] **Settings page**, with a menu item in `LogisticsLayout.tsx`:
  - the user's photo, name, email, mobile (changed with a code) and password, reusing the existing account endpoints
  - the company's details and logo
  - the company GCash (the endpoint already exists: `GET/PATCH /logistics/gcash`)
- [ ] **Messages page**, with a menu item:
  - There's **no courier chat in the backend yet**. Decide who the courier talks to first (its hubs? its riders? shops? Loved-IT admin?), then add the backend for it.
- [ ] Modern, professional layout. Keep the courier portal's color theme.

## 3. Rider chat improvements

- [ ] Add a **"Message rider"** button on Track Package, so the buyer can start the chat. Right now only the rider can start it, so this needs a backend change too (`RiderChatService`). Show it only while the parcel is out for delivery.
- [ ] Put the **rider's first name** in the "Out for delivery" notification and email, for example "Juan is bringing your parcel". (Look at `MailNotifier.php` and `Notifier.php`.)

## 4. Redesign the footer pages

- [ ] **About Loved-IT** (`/about`, `pages/AboutUsPage.tsx`)
- [ ] **Help and Safety Center** (`/help/safety`, `pages/help/SafetyHelpPage.tsx`)

Make both modern and professional, with a new layout. Keep the colors matching the rest of the site.

## 5. Redesign the shop profile

The current design was based on LinkedIn. Redesign it to look modern and professional, with a new layout. Keep the color theme.

- [ ] **Public shop page** (`/shop/:slug`, `pages/ShopProfilePage.tsx`)
- [ ] **Seller's Shop Profile page** (`/seller/shop-profile`, `pages/seller/SellerShopProfilePage.tsx`). Do the same redesign so both match.

## 6. Shop reviews (new feature)

Right now buyers can only review **products**. The shop page's Reviews tab and star rating are all the shop's product reviews combined, so there's no review button on the shop. Add real shop reviews:

| Rule | How it works |
|---|---|
| Who can review | Only buyers with at least **1 completed order** from that shop |
| How many | **1 review per buyer per shop**. They edit it instead of posting a new one. |
| Editing limit | At most **2 edits per day** for the same shop |
| Fields | **Stars 1–5** (required). **Comment** up to 500 characters (optional). **Quick tags** (optional): "Fast shipping", "Good packaging", "Responsive seller", "Item as described" |
| Seller reply | 1 reply per review, which they can edit, like product reviews |
| Where it shows | The shop page shows the **average + the 3 latest** and a **"See all reviews"** button. That opens a **new page**, `/shop/<name>/reviews`, with all shop reviews, a star filter, and newest first. |

- [ ] Backend: a new table (additive migration), endpoints, the rules above checked on the server, and tests
- [ ] A review button on the shop page for buyers who can review
- [ ] The new `/shop/<name>/reviews` page
- [ ] The seller can see and reply to shop reviews (Reviews & Ratings page)
- [ ] The admin's Reviews page shows shop reviews too (read-only)

## 7. AI that checks products when a seller publishes them

Use **Claude** to read the product's name, description, category and price, and **look at the photos**. It answers with one of three results:

- ✅ **Approve**: looks normal, so it goes live.
- ⚠️ **Send to admin**: unsure (the price looks too low, the photo doesn't match, it might be fake). It waits in the admin's Products page with the AI's reason.
- ❌ **Reject**: clearly not allowed (weapons, drugs, adult content, and so on). The seller sees the reason.

- [ ] At first, let the AI only **approve** and **flag**. The admin makes the final call on rejections until we trust it.
- [ ] The admin Products page already has approve/reject for products waiting for review (status `pending_review`). Use that list for the flagged products.
- [ ] If the AI can't be reached (no credits, network error), send the product to the admin instead of publishing it.

## 8. AI customer support chatbot in Messages

Add a **"Loved-IT Support"** chat in the buyer's Messages, powered by Claude. It can:

- answer questions using the buyer's **own orders**: "Where is my order?", "Can I still cancel?", "How do I return this?"
- explain the rules: delivery fees, the 7-day return window, payment methods
- hand the chat to the **admin** when it can't help ("Talk to a person")

- [ ] It must **not** do money actions by itself (refunds, cancelling). It only explains and guides.
- [ ] It can only see the signed-in buyer's own orders, never anyone else's.

## AI setup and cost (for tasks 7 and 8)

- **Model:** Claude **Sonnet 5.5** (`claude-sonnet-5-5`). It's half the price of Opus 5.5 and good enough for checking products and support chat. Haiku 5.5 is the cheapest if we need to save more.
- **Library:** Anthropic's official **PHP SDK**, so it fits the Laravel backend. Read its documentation before writing code; don't guess the method names.
- **API key:** put it in `.env` as `ANTHROPIC_API_KEY`. Never commit it.
- **Product check:** use structured output so the answer is always one of approve / send to admin / reject, plus a reason.
- **Refusals:** the AI can sometimes decline a request. Always check why it stopped before using its answer.

| Use | Sonnet 5.5 (chosen) | Opus 5.5 | Haiku 5.5 (cheapest) |
|---|---|---|---|
| Checking 1 product (text + 3 photos) | about $0.015–0.025 (₱1–1.50) | about $0.03–0.05 (₱2–3) | about $0.001 |
| 1 chatbot reply | about $0.01 (₱0.60) | about $0.02 (₱1) | about $0.0005 |

**Paying:** the Claude API is pay-as-you-go. Credits are bought with a **card**, and a GCash number doesn't work directly. The **GCash Card (Visa)** may work. For a capstone demo, a few dollars of credit lasts a long time.
