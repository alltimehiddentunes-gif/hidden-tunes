# Payments Test Matrix

## Backend unit

Product mapping, duration/extension, expiry, refund revoke, cancel-at-period-end, duplicate txn/webhook, bad signature, amount/currency/product mismatch, wrong user, overlapping providers, account switch.

## Adapter / sandbox

Apple, Google, Flutterwave, Paystack, PayPal — test mode only; never production charges in CI.

## Integration

Checkout → simulated provider → webhook → transaction → entitlement → API → client Premium.

## Mobile

Purchase, restore, pending, cancel; entitlement refresh; logout clears cache; account isolation.

## Desktop

Pricing load; each provider URL opens; return does not auto-activate; refresh after webhook; pending/fail/cancel; Electron security gates.

## Web

Auth required; pending/success/failure; callback tampering rejected.

## Phase A

Documentation only — no automated payment tests yet.