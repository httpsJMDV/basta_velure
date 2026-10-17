# System assessment — 18 October 2026

All eight result workbooks are rebuilt from the original files in docs2. Only yellow cell contents are filled. Original filenames, sheets, instructions, test cases, expected results, styles, row heights, widths, merges and formulas are retained.

## Results

469 cases assessed: 134 Pass, 179 Fail, 156 Blocked, 0 Not Run.

| Workbook | Cases | Pass | Fail | Blocked |
|---|---:|---:|---:|---:|
| Account_Creation-Buyer | 30 | 15 | 10 | 5 |
| Account_Creation-Seller | 44 | 20 | 15 | 9 |
| Account_Creation-Logistics | 44 | 21 | 12 | 11 |
| Account_Creation-Rider | 32 | 10 | 12 | 10 |
| Buyer_Modules | 110 | 33 | 41 | 36 |
| Seller_Modules | 124 | 19 | 55 | 50 |
| Logistics_Modules | 44 | 4 | 19 | 21 |
| Rider_Modules | 41 | 12 | 15 | 14 |

## How the results were obtained

- The 150 Account Creation results were recovered from the previous assistant's recorded browser run. Their Remarks identify that provenance. Every original Blocked record was compared against its Actual Result, Remarks and required setup. Input/token/state-dependent tests that cannot be executed are Blocked; the base capability case records the missing feature as Fail. Previously passing multi-part cases were corrected where recorded evidence did not satisfy the full expected result. These 150 registrations were not all rerun as fresh tests.
- The 319 module cases were assessed using real API requests, Edge interactions and explicit implementation review. More than 475 API/multipart evidence entries are recorded, including setup, reruns and follow-up checks. Missing-feature/source-review failures are labeled in Remarks; they are not presented as executed browser steps.
- Blocked means a failed prerequisite prevented execution, with no verdict on the dependent behavior. A failed case means the exact workbook expected result was not met. It can identify a missing feature, a design difference, a backend/UI defect or a directly observed broken workflow. A dependent case prevented by that workflow is Blocked. It does not mean every individual step in the case failed.
- Setup substitutions are stated in Remarks: e.g. a fresh equivalent product for the two-review average, a temporary saved office address for snapshot testing, direct GCash in place of a nonexistent payment gateway, and test-only available balance/courier membership fixtures.
- Tests ran on the existing code against isolated database velure_blackbox, separate storage and log mail. No application fixes were applied and no live payment was sent. Application code was not changed.

## Examples of verified findings

- Product/quantity validation accepts zero prices, fractional cart quantities and oversized stock values.
- Name-only draft saves and a valid 500-character shop description cause server errors.
- Duplicate checkout/product/payout requests can create duplicate records; a second payout is accepted while another is pending.
- A return can be submitted before delivery; return evidence-photo support and the specified deadline/approval workflow are incomplete.
- Product chat rejects a real approved shop with Target user is not a registered seller; seller conversation initialization returns a server error.
- New COD orders appear under To pay; buyer order history drops records after its first 15 because the frontend discards pagination.
- Full COD fulfillment, stock row locking, selected ownership checks, pickup replay protection, gallery image switching and rating-average updates worked in executed tests.
- Voucher wallets, store-category hierarchy, scheduled/flash promotions, company rate editors and several other workbook features are absent or belong to another role; each affected case identifies the missing behavior.

## Evidence

- [Case-by-case status review and before/after reasons](../status-review.json)
- [Runtime and implementation evidence](../full-evidence.json)
- [Earlier expedited API evidence](../api-evidence.json)
- [Edge screenshots](../shots)
- Per-case JSON results: testing-continuation/bb/results.
- Original account screenshots remain in the previous assistant's scratchpad/bb/shots folder; references in recovered results belong to that recorded run.

## Workbook integrity verification

Run php testing-continuation/verify-yellow-only.php. It compares every ZIP member and requires every byte outside yellow worksheet cells to match the original; it also checks cell attributes/styles and confirms every case has Actual Result, Pass/Fail Status and Remarks (Blocked is allowed for an unexecutable dependency). Verification output is saved in workbook-verification.txt. Excel may update formula caches when opened; this writer does not change formulas or workbook calculation settings.
