# Paystack (Phase C)

## Use

Additional web/desktop provider for fixed-duration Premium passes where merchant countries support it.

## Flow

Same as Flutterwave: server checkout → hosted payment → signed webhook → verify → entitlement.

## Env names

`PAYSTACK_PUBLIC_KEY`, `PAYSTACK_SECRET_KEY`, `PAYSTACK_WEBHOOK_SECRET` (or equivalent signing secret)

## Status

Not implemented.