# Flutterwave (Phase C)

## Use

Web + desktop-originated checkout for `ht_premium_pass_30` / `ht_premium_pass_365`.

## Channels (merchant-dependent)

Cards, Mobile Money, bank transfer, USSD, others if enabled.

## Flow

```text
POST /api/payments/checkout { provider: flutterwave, productCode }
→ backend creates payment with server amount
→ client opens hosted checkout URL
→ webhook + server verify
→ entitlement grant/extend
```

## Env names (no values)

`FLUTTERWAVE_PUBLIC_KEY`, `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_WEBHOOK_SECRET`

## Status

Not implemented. Production activation blocked until merchant + webhook URL ready.