# Hidden Tunes Payments — Current State Audit

## Verdict

**Greenfield monetization.** Hidden Tunes has no live payment providers, no user subscription tables, no IAP SDKs, and no backend entitlement API. Desktop Premium UI is an honesty placeholder (`checkoutAvailable: false`). Mobile “Premium” is visual branding only. Backend “subscription/payment” fields classify **third-party content access**, not HT billing.

---

## Desktop

| Present | Missing |
| --- | --- |
| `premiumPresentation.ts` honesty layer | Checkout, webhooks, entitlements |
| Membership preview page | Provider SDKs / secrets |
| `verify:premium-honesty` | Account sign-in for listeners |
| Electron `shell.openExternal` security path | Desktop entitlement refresh loop |

**Auth today:** Supabase session used for artist follow only; sidebar shows local “Hidden Listener”.

## Mobile

| Present | Missing |
| --- | --- |
| Expo 56 + custom native modules | StoreKit / Play Billing |
| Profile / stub auth screens | Premium purchase UI |
| Sports external “subscription required” messaging | Restore Purchases |
| CarPlay entitlements (Apple capability) | Receipt verification |

**Binary note:** Adding IAP requires a **new native binary** (not OTA). `ios/` present; `android/` generated via prebuild/EAS.

## Backend (`hidden-tunes-admin`)

| Present | Missing |
| --- | --- |
| Supabase Auth (UUID users) | `payment_*` / `entitlements` tables |
| `uploader_profiles` staff roles | Flutterwave / Paystack / PayPal / Apple / Google adapters |
| Catalogue APIs on `/api/*` | Webhook routes |
| Admin uploader tools | Subscriber support console |

**Do not confuse with billing:**

- `radio_stations.requires_payment` / sports `access_type=subscription` → external stream eligibility
- ScoreBat live entitlement env → provider licensing
- “Premium” player shells / synced lyrics editor naming → UX only

## Providers searched

Stripe, Paystack, Flutterwave, PayPal, MoMo, RevenueCat, StoreKit, Play Billing, checkout, invoice, entitlement webhook — **not implemented** in HT code.

## Foundation to reuse

1. Desktop `premiumPresentation.ts` as client copy/authority flags until real entitlement API exists.
2. Supabase Auth UUID as `user_id` for entitlements.
3. Next.js `/api` Route Handlers + service-role admin client patterns.
4. Electron external-open allowlist for web checkout URLs.

## Competing system risk

**None.** No second billing stack to merge. Build one backend entitlement system from scratch.