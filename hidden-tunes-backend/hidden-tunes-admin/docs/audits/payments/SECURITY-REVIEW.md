# Payments Security Review (Phase A)

## Already true

- No payment secrets in repos audited
- Desktop Electron: contextIsolation, sandbox, navigation policy, CSP (Phase 4)
- Desktop Premium honesty: no fake checkout (Phase 5)

## Required before go-live

| Control | Status |
| --- | --- |
| Webhook signature verification | Designed |
| Idempotency | Designed |
| Server-owned amounts/products | Designed |
| Checkout URL allowlist | Designed |
| Secrets in env / secret manager | Required |
| Separate dev/staging/prod | Required |
| RLS on entitlement tables | Designed |
| Admin authz for grants | Designed |
| Redacted logging | Designed |
| Rate limits on webhooks/checkout | Designed |
| Open-redirect prevention | Designed |
| No client-trusted Premium unlock | Required |

## Env var names (document only)

See PRODUCTION-CHECKLIST. Never commit values.

## AfriMeetup

Not used. No shared DBs, keys, or product IDs.