# PayPal (Phase C)

## Use

Web/desktop one-time 30/365-day Premium passes. Recurring PayPal subscriptions optional later.

## Flow

```text
Backend creates order
→ user approves on PayPal
→ backend captures
→ PayPal webhook confirms
→ entitlement grant
```

Never grant from return URL alone.

## Env names

`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_ENVIRONMENT`

## Status

Not implemented. Client secret backend-only.