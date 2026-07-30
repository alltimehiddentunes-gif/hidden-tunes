# Google Play Billing (Phase F)

## Scope

Play-distributed Android Premium monthly + annual.

## Client

- Play Billing Library via Expo-compatible module.
- Requires **new Play binary**.
- Acknowledge purchases; send purchaseToken to backend.
- Restore/re-query → `/api/payments/restore`.

## Backend

- Google Play Developer API verification.
- Real-time Developer Notifications.
- Map grace, account hold, cancel, refund, revoke.

## Policy

No alternative digital IAP for Premium inside Play binary.

## Status

Not implemented. Play Console products not created.