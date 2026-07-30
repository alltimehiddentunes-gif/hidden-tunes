# Production Activation Checklist

Do **not** enable live charges until all items are complete.

## Business / compliance

- [ ] Merchant accounts approved (Apple, Google, Flutterwave, Paystack, PayPal as used)
- [ ] Settlement bank account confirmed
- [ ] Prices and currencies confirmed
- [ ] Refund policy published
- [ ] Privacy policy updated for payments
- [ ] Terms of service updated
- [ ] Support process for billing disputes

## Technical

- [ ] Production credentials in secret manager (not git)
- [ ] Product identifiers created in each console
- [ ] Webhook URLs registered + signatures verified
- [ ] Sandbox matrix passed (STAGING-RESULTS.md)
- [ ] Apple products ready for review
- [ ] Google products configured
- [ ] Monitoring / alerting on webhook failures
- [ ] Reconciliation job scheduled

## Env names (populate securely)

```text
APPLE_ISSUER_ID
APPLE_KEY_ID
APPLE_PRIVATE_KEY
APPLE_BUNDLE_ID
GOOGLE_PLAY_PACKAGE_NAME
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON
FLUTTERWAVE_PUBLIC_KEY
FLUTTERWAVE_SECRET_KEY
FLUTTERWAVE_WEBHOOK_SECRET
PAYSTACK_PUBLIC_KEY
PAYSTACK_SECRET_KEY
PAYPAL_CLIENT_ID
PAYPAL_CLIENT_SECRET
PAYPAL_WEBHOOK_ID
PAYPAL_ENVIRONMENT
PAYMENTS_RETURN_URL
PAYMENTS_CANCEL_URL
PAYMENTS_WEBHOOK_BASE_URL
```

## Phase A

Checklist incomplete by design — architecture only.