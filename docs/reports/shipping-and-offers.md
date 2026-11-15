# Loved-IT shipping and offers check

Checked November 13, 2026, Manila time.

## Published fixes

- Sellers can buy from other shops. The shared Laravel API rejects their own listings on cart add/update and checkout, including direct requests and old cart items. PR #55: https://github.com/httpsJMDV/basta_velure/pull/55
- Buyer risk review now uses the shared CustomSelect for all five priority filters. PR #56: https://github.com/httpsJMDV/basta_velure/pull/56
- Both changes are merged into main and deployed. The frontend browser check passed on the production site with mocked admin data; it checked the filter requests without accessing customer accounts. The API self-purchase check used a transaction and rolled back all test writes.
- The scheduler remains OFF. Its previously registered restart is Sunday November 15 at 8 a.m. Manila time.

## Where buyers find offers in Flutter

Use the current Android download at https://loved-it.shop/download (build 26111321).

- Home → Vouchers, or Account → My vouchers: save platform/shipping offers and enter a voucher code.
- Product or shop pages: save that shop's claimable vouchers.
- Home → On sale: browse discounted products. The production API returned 131 eligible products during this check.
- Checkout: choose a saved shop, platform or shipping voucher, or enter the code. The backend applies and validates the discount.
- Shop promotions such as bundles are reflected in the cart and checkout when their quantities qualify.

Live data at inspection: one ongoing claimable store voucher, Handicrafts' SAVE30 (configured as 60% off, minimum spend ₱100). Its name does not determine its discount. There were no platform or shipping vouchers, no bundle/buy-X-get-Y promotions, and no shops with seller-funded free delivery configured. Store sales do exist. An empty wallet is not proof that the app lacks voucher support.

## Why shipping can be expensive

The current system uses its own courier rate table, not a live Shopee, Lazada or J&T quotation. Per shop, it adds product weight × quantity, rounds up to a whole kilogram (minimum 1 kg), and charges:

`first kilogram + (charged kilograms − 1) × additional-kilogram rate`

Each shop ships as its own parcel. Fees add up across shops.

| Route | First kg | Each additional kg |
|---|---:|---:|
| Within NCR | ₱50 | ₱15 |
| Within Luzon, Visayas or Mindanao | ₱60 | ₱20 |
| NCR ↔ Luzon | ₱80 | ₱20 |
| Luzon/NCR ↔ Visayas; Visayas ↔ Mindanao | ₱120 | ₱40 |
| Luzon/NCR ↔ Mindanao | ₱150 | ₱50 |

A recent Tumba tumba order contained one product recorded at 15 kg. Its ₱340 fee was exactly ₱60 + 14 × ₱20. Other recent inspected orders had ₱60 fees at 1 kg. Verify the actual packed weight before changing this listing; the check did not establish that 15 kg was incorrect.

## Who gets paid

| Recipient | Current calculation |
|---|---|
| Pickup rider | Fixed ₱30 per recorded pickup |
| Delivery rider | Fixed ₱50 per successful delivery |
| Sorting hub | 15% of the recorded courier fee |
| Truck driver | Default ₱800 per completed trip, with a company override available; not ₱800 per parcel |
| Courier company | Receives its courier fee and bears rider, hub, truck and operating costs; no guaranteed residual percentage |

These payouts do not set the buyer's shipping quote. Old 20% pickup / 65% delivery comments do not describe the active fixed rider-pay logic.

For example, ₱60 revenue minus ₱30 pickup, ₱50 delivery and ₱9 hub leaves **−₱29 before truck and operating costs**, when all those jobs apply. Cutting the courier's rate alone would deepen that loss. A truck trip shared by 40 parcels allocates ₱20 per parcel; the same trip carrying four parcels allocates ₱200 each. This is an illustration, not an additional checkout fee.

## Free shipping: who funds it?

**Admin shipping voucher:** Admin → Vouchers creates a shipping-scope offer. The buyer saves/applies it; minimum spend, dates, usage limits and cap are checked at checkout. Loved-IT funds this discount. On direct orders, it becomes a credit against the seller's monthly platform commission; a credit exceeding commission must still be reconciled. The courier's recorded fee is preserved.

**Seller-funded free delivery:** Seller Center → Payments → GCash & delivery → Free delivery, set a minimum purchase, then save. The buyer's delivery fee becomes zero when that shop qualifies. The seller still covers the courier fee through the courier/shop weekly settlement. The seller does not separately calculate a rider commission; the logistics company handles rider payments.

A ₱50 shipping voucher on ₱60 delivery leaves ₱10 payable; it is not unlimited free shipping. The same voucher on ₱40 delivery discounts only ₱40. Seller store vouchers discount merchandise; they are separate from admin shipping vouchers and the seller's free-delivery setting.

## Recommendation prepared for the four-person test

SHIP50 was an optional proposal: ₱50 off shipping, minimum merchandise spend ₱299, once per buyer, four uses total, ending November 16, 2026 at noon Manila time. Maximum promotional liability would have been **₱200**, separate from Laravel hosting credits. A rollback-only production check passed. **It was not activated: the user clarified that they want the base delivery fee changed instead.** The separate Loved-IT-Delivery-Rate-Proposal.md contains the prepared base-rate reduction.

For a lasting reduction: verify packed weights and units; negotiate real courier rates; combine same-shop items and consolidate truck loads; then fund a capped promotion with a defined budget. Heavy furniture needs separate pricing or a larger explicitly funded subsidy. Avoid comparing a heavy parcel's full courier fee with another marketplace's discounted small-parcel checkout amount.

J&T's official calculator requests origin, destination, weight and dimensions; its terms use the greater of actual and dimensional weight. Those rates should be checked for the same parcel before choosing a replacement courier table: https://www.jtexpress.ph/freightQuery and https://www.jtexpress.ph/termsAndConditions

## Verification

- Backend: 912 tests, 11,280 assertions passed for the self-purchase release.
- Frontend: TypeScript/Vite build and lint passed with existing warnings.
- Browser: desktop/mobile custom filter selection and API parameters, AI response/outage, cancellation confirmation and search empty state passed with no page errors. Production download and admin sign-in protection also passed.
- Flutter: 48 relevant buyer, home shortcut and guest/product tests passed. No Flutter source changes or replacement APK were needed for these fixes.
- Following the user's request for standard delivery at ₱50 instead of ₱60, all 16 courier routes were updated using the prepared lower rate table. Standard within-island first-kg delivery is ₱50, with ₱10 per additional kg. The same shared checkout calculator serves web and Flutter. The transaction passed its 1 kg and 15 kg checks and recorded each rate change in the shipping audit log. Rider pay, seller discounts, existing orders and voucher budgets were unchanged. The rate table above describes the original rates; Loved-IT-Delivery-Rate-Proposal.md records the applied reductions.
