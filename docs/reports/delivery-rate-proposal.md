# Proposed delivery rate reduction

Status: applied to production on November 13, 2026, after the user requested standard delivery at ₱50 instead of ₱60. Cloud command comm-a337712e-5372-4a95-833f-fbf17130cfb4 succeeded. All 16 rate updates committed together and were audit-logged. No voucher was activated.

Post-save verification: command comm-a337718d-5e47-48c6-82dc-9e42300910b7 recalculated two existing baskets through the live CheckoutCalculator without placing orders. The 1 kg basket now quotes ₱50 and the 15 kg basket quotes ₱190, both serviceable. Their existing orders still store ₱60 and ₱340 respectively. All 16 audit entries exist, pickup/delivery pay remain ₱30/₱50, and SHIP50 does not exist.

Amounts are per shop's parcel. Weight is rounded up to a whole kilogram, minimum 1 kg.

| Route | Current first kg → proposed | Current additional kg → proposed |
|---|---:|---:|
| Within NCR | ₱50 → ₱40 | ₱15 → ₱10 |
| Within Luzon, Visayas or Mindanao | ₱60 → ₱50 | ₱20 → ₱10 |
| NCR ↔ Luzon | ₱80 → ₱60 | ₱20 → ₱10 |
| Luzon/NCR ↔ Visayas; Visayas ↔ Mindanao | ₱120 → ₱80 | ₱40 → ₱20 |
| Luzon/NCR ↔ Mindanao | ₱150 → ₱100 | ₱50 → ₱25 |

The recent 15 kg Tumba tumba example would decrease from ₱340 to **₱190**. A 1 kg parcel within Luzon would decrease from ₱60 to **₱50**. Product weight must stay accurate; it has not been established that the listing's 15 kg is wrong.

This changes the courier's base table, so both Flutter and web receive the lower fee on new checkout quotes. Existing orders retain their recorded charges. No voucher code, minimum spend or platform-funded discount is involved. Pickup pay stays ₱30 and successful delivery pay stays ₱50; the hub still earns 15% of the courier fee. The logistics company therefore receives less revenue and bears any shortfall. These are proposed project rates, not verified contracted courier prices.

The prepared update checks all 16 existing routes, runs in one transaction, refuses unexpected current prices, and records every saved change in the existing shipping audit log. A rollback-only check verifies 1 kg and 15 kg quotes before any real update.
