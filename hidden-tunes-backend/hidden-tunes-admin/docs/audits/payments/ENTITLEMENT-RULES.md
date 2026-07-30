# Hidden Tunes — Entitlement Rules

## Key

`hidden_tunes_premium`

## States

`active` | `trial` | `grace_period` | `expired` | `revoked` | `refunded` | `pending` | `payment_failed`

## Effective Premium

Server computes:

```text
premium = exists entitlement where
  entitlement_key = hidden_tunes_premium
  AND status IN (active, trial, grace_period)
  AND starts_at <= now()
  AND (expires_at IS NULL OR expires_at > now())
  AND revoked_at IS NULL
```

Cached booleans on clients are derived only from this API response.

## Fixed-duration passes

- No active Premium → start now, expire `now + duration_days`.
- Active Premium → **extend** from current `expires_at` (never shorten).

## Subscriptions (Apple/Google)

Map store period start/end and grace/hold states into entitlement windows. Cancel-at-period-end keeps access until period end.

## Cross-provider

- One shared Premium entitlement timeline may be extended by any verified grant.
- Transaction rows remain separate.
- Refund/revocation removes or shortens access attributable to that grant; policy documented in refunds doc.

## Forbidden

```text
isPremium = true  // client-only permanent truth
```