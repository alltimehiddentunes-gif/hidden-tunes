# Webhook Security

1. Preserve raw body for signature verification.
2. Verify provider signature / JWT; reject otherwise (401/400).
3. Record `(provider, provider_event_id)` uniquely.
4. Idempotent processing — second delivery returns success without re-grant.
5. Ack quickly; heavy work after durable event insert.
6. Re-fetch critical transaction state from provider API when required.
7. Match amount/currency/product to `payment_products`.
8. Update transactions → subscriptions → entitlements → audit log.
9. Never trust redirect query strings or client amounts.
10. Rate-limit webhook endpoints; alert on signature failures.

## Idempotency keys

provider event ID, transaction ID, order ID, internal checkout reference, Apple transaction ID, Google purchaseToken.