# Hub: parcels waiting for their rider (handover QR)

## `GET /api/v1/hub/dispatch/awaiting-pickup`

Approved hubs only (same guard as the rest of `/hub`). Lists this hub's `ASSIGNED_TO_RIDER` parcels, grouped by the rider they are assigned to, oldest assignment first. Parcels of other hubs and parcels in any other status never appear.

```json
{ "data": [
  { "rider": { "id": 7, "name": "Pedro Mendoza" },
    "parcels": [
      { "tracking_number": "LIT-261016-AB34X9", "order_number": "VEL-...", "barangay": "Anibong", "recipient_name": "Ana Buyer", "assigned_at": "2026-10-16T08:00:00+00:00" }
    ] }
], "meta": { "parcel_count": 1 } }
```

Riders are sorted by name.

## How the handover works

1. The hub assigns sorted parcels to a rider (`POST /hub/dispatch/assign`, unchanged).
2. The hub's Dispatch page shows **Waiting for riders to collect**. **Show QR codes** draws one QR code per parcel in the browser. The QR carries the **tracking number** only, the same text as the barcode on the seller's waybill.
3. The rider opens **Deliveries > Collect at hub**, taps **Scan with camera** and scans each code off the hub's screen. Typing the number or using a USB scanner still works. The scan ticks the parcel and **Start** moves it to `OUT_FOR_DELIVERY` (`POST /rider/deliveries/start`, unchanged).

Nothing about permissions changed: the rider can only start parcels assigned to them, so a QR for another rider's parcel is rejected by the same check as a typed number.

The waybill itself is unchanged. The **seller** prints it (`docs/api/seller-waybill.md`); the rider scans its Code 128 barcode at pickup and the hub scans it at intake. The scanner reads Code 128 and QR codes.
