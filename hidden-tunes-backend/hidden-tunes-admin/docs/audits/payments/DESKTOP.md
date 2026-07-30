# Desktop Premium Integration (Phase D)

## Preferred flow

```text
User selects plan on desktop
→ POST /api/payments/checkout (authenticated)
→ backend returns HTTPS checkout URL
→ Electron opens via validated shell.openExternal
→ provider completes payment
→ webhook verifies
→ desktop polls GET /api/entitlements/premium or Refresh
```

## UI

Extend honesty surface (`premiumPresentation.ts`):

- Free / Premium status from API
- Expiry / renews flags
- Flutterwave / Paystack / PayPal options
- Refresh Premium
- Pending verification state (do not show active on return alone)

## Security

- No provider secrets in renderer/preload/dist
- Preserve contextIsolation, sandbox, navigation policy, CSP
- Allowlist checkout hosts only

## Auth prerequisite

Listener sign-in with Supabase must exist before checkout (guest purchase blocked without recovery plan).

## Status

UI honesty exists; checkout + entitlement sync not implemented.