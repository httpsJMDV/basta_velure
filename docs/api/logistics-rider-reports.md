# Hub, courier network and rider reports (JSON, Excel, PDF)

Added Nov 9, 2026. One report per role, built once on the server (`App\Services\Reports\LogisticsReports`) as a
`ReportDocument` and given three ways, so the screen, the Excel file and the PDF always show the same figures.

| Who | Base | Report |
|---|---|---|
| Approved hub (`approved_sorting_center`) | `/api/v1/hub/reports` | Hub report: intake to delivery, by day, by rider, hub earnings |
| Courier team (`logistics_member`) | `/api/v1/logistics/reports` | Network report: every hub with parcels, by day, truck trips |
| Rider or truck driver (`approved_rider`) | `/api/v1/rider/reports` | Rider report: earnings, pickups, deliveries, failed tries, jobs, trips |

The hub, company or rider always comes from the signed-in account, never from the request.

## Period

`from` and `to` are inclusive Philippine days (`Y-m-d`), the same rules as the hub reports
(`HubReportRequest`): both optional (the last 30 days ending today), at most 366 days, `from` on or before `to`.
Each event counts on its own day (docs/api/logistics-hub-reports.md).

## Endpoints

| Method and path | What |
|---|---|
| `GET {base}/document?from=&to=` | The report as JSON (below). Tables have at most 100 rows here; `total_rows` says how many the files have. |
| `GET {base}/file?format=xlsx\|pdf&from=&to=` | The file, for the website (sent with the token). `throttle:20,1`. |
| `POST {base}/link {format, from, to}` | `{data: {url, expires_at, format}}`: a link to the file that works for **10 minutes without the token**. The app opens it in the phone's browser, which saves the file to Downloads. `throttle:20,1`. |
| `GET /api/v1/reports/files/{hub\|courier\|rider}?user=&format=&from=&to=&expires=&signature=` | That link (Laravel signed route `reports.file`). A changed or expired link answers `403`. The account must still be active and still have access. |

`format` other than `xlsx` or `pdf` answers `422` with `errors.format`. Files come with
`Content-Disposition: attachment; filename="hub-report-<name>-<from>_to_<to>.xlsx"`, `Cache-Control: no-store`.

## The JSON

```json
{
  "kind": "hub", "title": "Hub report", "owner": "J&T Express Santa Cruz Hub",
  "range": { "from": "2026-11-03", "to": "2026-11-09", "days": 7, "label": "Nov 3 to Nov 9, 2026", "timezone": "Asia/Manila" },
  "made_at": "2026-11-09T12:00:00+08:00",
  "kpis": [ { "label": "Received", "type": "int", "value": 2, "hint": "Parcels scanned in at the hub", "display": "2" } ],
  "sections": [
    { "title": "By day", "columns": [ { "label": "Date", "type": "date" }, { "label": "Received", "type": "int" } ],
      "rows": [ ["2026-11-07", 1] ], "total_rows": 7, "total": ["Total", 2], "note": null, "empty": "Nothing in this period." }
  ],
  "notes": [ "Days are Philippine time. ..." ]
}
```

Cell types: `text`, `int`, `money` (pesos), `percent` (a share from 0 to 1, or null), `hours` (or null), `date`
(`Y-m-d`), `datetime` (ISO 8601). Null reads as "—". A label in a total row ("Total", "59 jobs") reads as text in
any column. The website (`utils/reportFormat.ts`) and the app (`report_data.dart`) format cells the same way as the
server (`ReportDocument::display`).

## The files

- **Excel**: a Summary sheet (every figure with what it means, and the notes), then one sheet per table with a frozen
  header, peso, percent and date formats and a bold total row (`XlsxWorkbook`).
- **PDF**: A4, written by hand without a library (`App\Support\PdfReport`, Helvetica): the heading, the figures four
  to a row, then the tables, which go on over pages with their header repeated and "(continued)", and a footer with
  the page number on every page. Helvetica has no peso sign, so amounts print as "PHP 1,250.00".

## What each report holds

- **Hub**: received, sorted, sent out, delivered, failed attempts, returned, success rate, on time (within
  `logistics.delivery_sla_hours`), time at the hub, delivery time, hub earnings (`hub_earnings`). Tables: by day, riders
  (the hub reports' rider rows), with a note when Loved-IT marked parcels delivered.
- **Courier network**: the same totals over the courier's approved hubs, hubs with parcels, truck trips and their pay.
  Tables: by hub (only hubs with parcels, busiest first; a note counts the idle ones) and by day. The figures come
  from grouped queries over the whole network (`HubReportService::totalsByHub`, `dailyForHubs`), not one summary per
  hub. `GET /logistics/reports` (the portal page) uses them too since Nov 9: busy hubs first, then idle ones by name,
  at most 200 rows, with `active_hubs` and `approved_hubs`.
- **Rider**: earned (jobs and truck trip pay), pickups, deliveries, failed attempts and returns (`delivery_logs`),
  not paid yet, average per job, truck trips for truck drivers. Tables: by day, jobs, truck trips.

Tests: `tests/Feature/LogisticsReportFilesTest.php`.
