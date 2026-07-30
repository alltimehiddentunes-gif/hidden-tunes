# Hidden Tunes — Product Catalogue

## Entitlement

```text
entitlement_key = hidden_tunes_premium
```

## Initial products (Phase B mapping; not live)

| Code | Platform | Provider | Access type | Duration | Auto-renew |
| --- | --- | --- | --- | --- | --- |
| `ht_premium_monthly_ios` | ios | apple | subscription | period | Yes |
| `ht_premium_annual_ios` | ios | apple | subscription | period | Yes |
| `ht_premium_monthly_android` | android | google | subscription | period | Yes |
| `ht_premium_annual_android` | android | google | subscription | period | Yes |
| `ht_premium_pass_30` | web/desktop | flutterwave \| paystack \| paypal | fixed_pass | 30 days | No |
| `ht_premium_pass_365` | web/desktop | flutterwave \| paystack \| paypal | fixed_pass | 365 days | No |

Provider store SKUs / price IDs are stored in `payment_products.provider_product_id` after Console/Dashboard creation.

## Benefits (truthful only)

Advertise only verified capabilities. Initial honest set may include:

- Membership-gated catalogue rows **when** backend gates exist
- Account-synced Premium status across devices
- Higher download / quality limits **when** implemented

Do **not** advertise: lossless, Atmos, spatial, AI DJ, family plans, device handoff, unlimited offline — unless verified.

## Future-ready product types (schema only)

monthly, annual, promotional, gift, lifetime, trial — supported by `access_type` + duration metadata without shipping unused SKUs now.