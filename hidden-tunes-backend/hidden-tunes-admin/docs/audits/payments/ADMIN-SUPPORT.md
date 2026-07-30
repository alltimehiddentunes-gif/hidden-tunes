# Admin Support Tools (Phase G)

## Required capabilities

- Search by user ID, internal reference, provider transaction ID
- View subscription + entitlement history
- View webhook event processing state
- Safe retry verification (provider re-query)
- Grant promotional entitlement (reason + expiry) — audited
- Revoke entitlement (reason) — audited

## Forbidden

Arbitrary payment status editing without provider proof.

## Auth

Existing uploader/admin role gates (`owner`/`admin`); extend carefully. All mutations → `entitlement_audit_log`.

## Status

Not implemented.