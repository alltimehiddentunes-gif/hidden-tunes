# Apple StoreKit (Phase E)

## Scope

iOS/iPadOS in-app Premium monthly + annual only.

## Client

- Compatible IAP library for Expo 56 + custom native modules.
- Requires **new App Store binary** after native dependency add.
- Purchase → send transaction to `/api/payments/apple/verify`.
- Restore Purchases → `/api/payments/restore`.
- Manage Subscription → Apple subscription management URL.

## Backend

- Verify signed transactions via App Store Server API.
- App Store Server Notifications V2 webhook.
- Map renewals, cancellations, refunds, revocations, grace periods.

## Policy

No Flutterwave/Paystack/PayPal digital IAP inside the iOS binary for Premium.

## Status

Not implemented. Sandbox products not created.