# Mobile Premium Integration (Phases E–F)

## Current

No Premium paywall; stub auth; no IAP deps.

## Target

### Premium screen

Plan, status, expiry, monthly/annual, Restore, Manage, legal text, loading/pending/error.

### iOS

StoreKit path only for digital Premium; restore; ASN-backed state.

### Android

Play Billing only; acknowledge; RTDN-backed state.

### Shared

After verify, refresh `GET /api/entitlements/premium`. Clear cache on logout. Account switch must not leak Premium.

## Binary

New EAS iOS + Android builds required after native IAP modules.

## Store policy audit

Before UI ships, re-check current Apple/Google rules for digital goods and external payment links; document outcome in SECURITY-REVIEW.