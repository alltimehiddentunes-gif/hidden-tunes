# Hidden Tunes Payments — API Contract

Follow existing Next.js Route Handler patterns under `app/api/**` with Bearer Supabase JWT for user routes.

## User routes (auth required)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/payments/products` | Active products for caller platform/country |
| POST | `/api/payments/checkout` | Create hosted checkout (web/desktop providers) |
| GET | `/api/payments/status` | Latest transaction/subscription summary |
| GET | `/api/payments/history` | Paginated user payment history |
| POST | `/api/payments/refresh` | Recompute entitlement from ledger |
| POST | `/api/payments/apple/verify` | Submit Apple transaction for verify |
| POST | `/api/payments/google/verify` | Submit Play purchaseToken for verify |
| POST | `/api/payments/restore` | Re-query Apple/Google + refresh |
| GET | `/api/entitlements` | All entitlements for user |
| GET | `/api/entitlements/premium` | Minimal Premium contract |

### Premium response shape

```json
{
  "premium": true,
  "entitlement": "hidden_tunes_premium",
  "status": "active",
  "source": "paypal",
  "startsAt": "2026-07-30T18:00:00Z",
  "expiresAt": "2026-08-29T18:00:00Z",
  "renews": false,
  "cancelAtPeriodEnd": false
}
```

Clients must ignore unknown fields.

### Checkout body (safe client input)

```json
{
  "productCode": "ht_premium_pass_30",
  "provider": "flutterwave",
  "returnDestination": "desktop",
  "country": "NG"
}
```

Server owns amount, currency, success/cancel URLs (allowlisted).

## Webhook routes (no user auth; signature required)

| Method | Path |
| --- | --- |
| POST | `/api/payments/webhooks/flutterwave` |
| POST | `/api/payments/webhooks/paystack` |
| POST | `/api/payments/webhooks/paypal` |
| POST | `/api/payments/webhooks/apple` |
| POST | `/api/payments/webhooks/google` |

## Admin (staff auth + role)

Support search/grant/revoke under `/api/admin/payments/*` — Phase G; audited.