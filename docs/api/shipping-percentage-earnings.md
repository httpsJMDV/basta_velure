# Shipping earnings for new orders

Approved November 15, 2026: pickup 30%, delivery 30%, handling branch 10%, route transport pool 15%, courier company 15%. These are percentages of the order's full `courier_fee`, not merchandise, COD cash held, or the buyer's discounted shipping charge. Platform merchandise commission is separate (the current production base rate is 10%, Food & Grocery overrides are 8%).

## Calculation and history

Checkout stores an immutable version-1 budget in `orders.shipping_earnings`. All amounts are integer centavos. Pickup/delivery/hub/transport shares are floored to a centavo and the courier receives the residual centavos; pickup and delivery always remain equal. The five allocations sum exactly to the courier fee, including for zero/tiny fees. For PHP 50: PHP 15 + 15 + 5 + 7.50 + 7.50.

An order placed before this release has a null snapshot and retains its existing compensation agreement. Existing rider/hub earning rows and truck trip pay are never rewritten. The fixed trip rate editor is explicitly labelled as applying only to previous orders. A mixed legacy/new-order truck trip adds the legacy trip agreement once plus the new parcels' transport allocations.

Pickup earnings are recorded on pickup; successful delivery records the delivery rider and handling branch. The same rider may earn both shares. Failed delivery attempts do not create delivery earnings; retrying a transition cannot duplicate the earnings. The branch allocation is recorded once for the parcel's handling/delivery branch, not 10% for every intermediate hub. Existing payout and remittance controls remain in use.

## Route transport

The first driver dispatch snapshots the parcel's complete planned forward route into `shipping_earnings.transport_legs`. The 15% pool is divided across its inter-hub legs; residual centavos go to the earliest legs. Sea/air legs retain their portion as an external carrier operating reserve, not a payment to an internal truck driver. A route with no inter-hub legs does not invent a truck payment.

Each internal driver trip earns the sum of its parcels' allocated leg amounts. Claims lock the order row, record the trip ID on the specific route leg, and can occur only once. Redispatch, subsequent hops, repeated receipt scans, route extension after the plan was frozen, or a return cannot claim the full forward pool again. Driver pay remains payable on completed/closed trips under the existing trip lifecycle.

The 15% company allocation is an operating share, not a claim of guaranteed net profit. The user also approved reserving up to 10% of the original courier fee from this share for return transport, leaving at least 5% (plus residual centavos) before other costs. `return_reserve_cents` is part of the company share, never an additional charge or sixth allocation. The first reverse dispatch freezes `return_transport_legs`, divided across that complete reverse route. Each reverse leg can be claimed once, for either a failed-delivery return or a buyer return; both cannot create separate pools for the same order. Unused reserves stay with the company. A PHP 50 fee reserves PHP 5 for return transport out of the company's PHP 7.50, leaving PHP 2.50 before other costs if fully used. Sea/air portions remain operating reserves. Local return work and other costs remain company operating expenses; this release does not invent a separate unapproved return-rider payment.

## Seller receives money independently of the shipping split

With no vouchers and PHP 1,000 merchandise + PHP 50 shipping at a 10% merchandise commission:

* Direct GCash: the buyer sends PHP 1,050 to the shop's GCash; the seller verifies it, settles PHP 50 with the courier and PHP 100 with Loved-IT, retaining PHP 900.
* COD: the rider collects PHP 1,050, remits the full amount to the courier (earnings are paid separately), and the courier's weekly shop statement deducts PHP 50 courier fees, leaving PHP 1,000 payable to the shop. The shop's monthly platform commission statement is PHP 100, leaving PHP 900 after payment.

Transfers are made manually through GCash, with references/receipts and confirmation recorded in Loved-IT. Recording a transfer does not send money through a GCash payment API. Aggregated weekly statements can offset GCash shipping owed against COD money owed. Store-funded free delivery retains the full courier fee payable by the shop; platform-funded vouchers are credited against the seller's commission balance by the existing rules.

## API and clients

`GET /rider/earnings/summary` adds `rates.pay_model=shipping_percentage`, equal `pickup_percent` and `delivery_percent`, and the five-way `policy`. The old fixed `pickup`/`delivery` fields remain for legacy client compatibility. Actual earned row amounts are authoritative for old and new orders.

`GET /hub/earnings` adds the five-way `shipping_policy`; `split` now describes 60% combined riders (30% each) and 10% branch, with the other allocations supplied in `shipping_policy`. Rider truck-pay responses add `pay_model` and `transport_percent`; trip `pay_amount` is the authoritative payable amount. No automatic GCash transfer or new buyer shipping surcharge is introduced.

Web and Flutter explain the allocation, equal rider shares, previous-order agreements and route transport pool. Install the new APK for the updated guide; the shared API controls actual earnings.
