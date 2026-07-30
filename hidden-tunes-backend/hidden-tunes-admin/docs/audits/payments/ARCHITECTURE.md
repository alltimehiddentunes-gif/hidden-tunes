# Hidden Tunes Payments — Architecture

## Core rule

> Apple and Google handle digital purchases inside their respective mobile apps; Flutterwave, Paystack and PayPal handle web and desktop-originated payments; the Hidden Tunes backend alone decides whether an account has Premium access.

```text
Apple StoreKit
Google Play Billing
Flutterwave
Paystack
PayPal
        ↓
Hidden Tunes payment verification service
        ↓
subscription + entitlement database
        ↓
Hidden Tunes user account (Supabase Auth UUID)
        ↓
Premium on iOS, Android, desktop, web
```

## Principles

1. **Server is source of truth** — never grant Premium from client success alone.
2. **One entitlement** — `hidden_tunes_premium` shared across providers.
3. **Provider adapters** — normalise outcomes; do not force identical APIs.
4. **Idempotent webhooks** — duplicate events must not double-grant.
5. **Platform policy** — no Flutterwave/Paystack/PayPal IAP inside App Store / Play binaries for digital Premium.
6. **Desktop** — open trusted HTTPS checkout; refresh entitlement after verification.
7. **Secrets** — backend env only; never Electron renderer/preload/mobile bundles.

## Component map

| Layer | Responsibility |
| --- | --- |
| Clients | Plan UI, start checkout/IAP, restore, display entitlement |
| Checkout API | Create provider session/order with server-owned price/product |
| Webhooks | Signature verify → event log → verify → transaction → entitlement |
| Entitlement engine | Compute active Premium from overlapping grants + refunds |
| Admin support | Read-only ledger + audited grant/revoke |

## Staged delivery

| Phase | Scope | Production charges |
| --- | --- | --- |
| A | Audit + architecture (this pack) | No |
| B | Schema, entitlement API, adapters interfaces, tests | No |
| C | Flutterwave + Paystack + PayPal web checkout + webhooks | Sandbox only |
| D | Desktop Premium + external checkout + refresh | Sandbox only |
| E | Apple StoreKit + ASN | Sandbox / TestFlight |
| F | Google Play Billing + RTDN | Sandbox / internal track |
| G | Reconciliation, refunds, launch checklist | After business approvals |

## Cross-device example

```text
User pays via Flutterwave web checkout
→ webhook verifies
→ entitlement active
→ iPhone refreshes GET /api/entitlements/premium
→ Premium UI shows active
```

This does **not** circumvent Apple/Google rules for in-app digital goods.