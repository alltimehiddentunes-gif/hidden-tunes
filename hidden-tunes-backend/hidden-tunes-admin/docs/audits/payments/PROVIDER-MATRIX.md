# Hidden Tunes — Provider Matrix

| Provider | Surfaces | Product form | Recurring? | Verification | Webhooks / notifications |
| --- | --- | --- | --- | --- | --- |
| Apple StoreKit | iOS/iPadOS app | Monthly + Annual subscription | Yes (Apple) | App Store Server API + transaction JWS | App Store Server Notifications V2 |
| Google Play Billing | Play Android app | Monthly + Annual subscription | Yes (Play) | Play Developer API purchaseToken | Real-time Developer Notifications |
| Flutterwave | Web + desktop-originated | 30-day / 365-day passes; cards, MoMo, bank, USSD where merchant-enabled | **No** unless merchant+method confirmed | Server verify + webhook | Flutterwave webhooks |
| Paystack | Web + desktop-originated | Same pass model; methods per country | **No** unless confirmed | Server verify + webhook | Paystack webhooks |
| PayPal | Web + desktop-originated | 30-day / 365-day orders; optional recurring later | Optional (Phase G+) | Capture + webhook | PayPal webhooks |

## Capability notes

- Mobile Money is **prepaid pass** by default — do not label auto-renewing.
- Provider method availability is country/merchant specific — configure products per market; hide unavailable methods.
- No silent FX conversion — explicit product rows per currency.
- Desktop never embeds provider secrets; uses backend checkout URL + `shell.openExternal` / approved window.

## Production readiness (Phase A)

| Provider | Code | Sandbox | Webhook | Products | Production-ready |
| --- | --- | --- | --- | --- | --- |
| Apple | Planned | Not started | Not started | Not created | No |
| Google Play | Planned | Not started | Not started | Not created | No |
| Flutterwave | Planned | Not started | Not started | Not created | No |
| Paystack | Planned | Not started | Not started | Not created | No |
| PayPal | Planned | Not started | Not started | Not created | No |