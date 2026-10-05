# Seller Waybill API Specification (Bridge B)

## Overview
When an order reaches `READY_FOR_PICKUP`, a physical logistics `Parcel` record is created with an unambiguous tracking number (e.g. `LIT-YYMMDD-XXXXXX`). This endpoint generates and serves all structured data required to render and print an A6 shipping label / waybill.

---

## 1. Waybill Details Endpoint

### `GET /api/v1/seller/orders/{order}/waybill`

**Authorization:**
- Authenticated via Sanctum Bearer token.
- User must be the seller owning the order's items, or a platform administrator.
- Other sellers receive `403 Forbidden`.

**Preconditions:**
- Order must have transitioned to `READY_FOR_PICKUP` or later.
- If no parcel exists yet (e.g. order is `PLACED`, `CONFIRMED`, or `PREPARING`), returns `409 Conflict`.

### Response: `200 OK`
```json
{
  "data": {
    "order": {
      "id": 105,
      "order_number": "VEL-ABCD-261005023000-1",
      "created_at": "2026-10-05T02:30:00.000000Z",
      "payment_method": "cod",
      "total": 599.00
    },
    "parcel": {
      "id": 42,
      "tracking_number": "LIT-261005-AB34X9",
      "status": "READY_FOR_PICKUP",
      "ready_at": "2026-10-05T02:40:00.000000Z",
      "pickup_barangay": "Poblacion",
      "destination_barangay": "Batasan Hills",
      "cod_amount": 599.00
    },
    "sender": {
      "shop_name": "Velure Boutique",
      "contact_phone": "09171112222",
      "street": "456 Burgos St",
      "barangay": "Poblacion",
      "city": "Makati City",
      "province": "Metro Manila",
      "full_address": "456 Burgos St, Poblacion, Makati City, Metro Manila"
    },
    "recipient": {
      "name": "Maria Santos",
      "phone": "09187654321",
      "street": "12 Sampaguita St",
      "barangay": "Batasan Hills",
      "city": "Quezon City",
      "province": "Metro Manila",
      "full_address": "12 Sampaguita St, Batasan Hills, Quezon City, Metro Manila"
    },
    "items": [
      {
        "id": 11,
        "product_name": "Floral Summer Dress",
        "variant_label": "Medium / Red",
        "quantity": 1,
        "unit_price": 500.00,
        "subtotal": 500.00
      }
    ],
    "cod": {
      "is_cod": true,
      "amount": 599.00
    },
    "barcode": {
      "format": "CODE128",
      "value": "LIT-261005-AB34X9"
    }
  }
}
```

### Error Responses
- **`403 Forbidden`**
  ```json
  { "message": "Unauthorized to access waybill for this order." }
  ```
- **`409 Conflict`**
  ```json
  { "message": "Waybill cannot be generated: parcel has not been created yet. Mark the order as Ready for Pickup first." }
  ```
- **`404 Not Found`**
  ```json
  { "message": "Record not found." }
  ```
