# Seller sales reports

The seller's Reports page (`/seller/reports`) and its two downloads. Every figure leaves out cancelled and returned
orders. Gross sales are the shop's item subtotals (shipping is not a sale, A9); net earnings are what the shop keeps
after its own vouchers and promotions and Loved-IT's commission.

## The window

Every endpoint takes the same window: `range=today|7d|30d|90d|12m|all` (default `30d`), or `from` and `to` as Manila
dates (`YYYY-MM-DD`, both days included). An end before the start, or a badly written date, answers 422 on `to` or
`from`.

## Endpoints (approved seller)

- `GET /seller/reports/summary` → `gross_sales`, `seller_discounts`, `commission_paid`, `net_earnings`,
  `total_orders`, `delivered_orders`, `units_sold`, `from`, `to`
- `GET /seller/reports/revenue-chart?interval=daily|monthly` → points `{date, iso_date, gross_sales, commission,
  net_earnings}`; monthly for `12m`, all time, or a window over 92 days
- `GET /seller/reports/payment-methods` → `cod`, `gcash`, `e_wallet_card` (`count`, `volume`: order totals with
  shipping), `total_orders`, `total_volume`
- `GET /seller/reports/top-products` → the 10 best products by gross sales
- `GET /seller/reports/export` → the report as an Excel workbook (`.xlsx`, 20 a minute):
  `{shop}-sales-report-{from}_to_{to}.xlsx` with the sheets **Summary**, **Sales by day** (or by month),
  **Payment methods**, **Products** (every product sold) and **Orders** (every order: number, placed, status, paid by,
  units, gross, shop discounts, commission, net). Money is in peso format, dates are real dates, headers are frozen,
  and text is never a formula. Written by `App\Support\XlsxWorkbook` on PHP's ZipArchive, no library.

## PDF

`/seller/reports/print?range=` (or `?from=&to=`) is an A4 page with the same figures: headline figures, the sum from
gross to net, a sales chart, payment methods, the best days or months and the best-selling products. The Reports page's
PDF button opens it with `print=1`, which opens the print dialog once the figures load; the seller chooses Save as PDF.

Tests: `tests/Feature/SellerReportExportTest.php`, and the report figures in `tests/Feature/CommerceOrdersTest.php`.
