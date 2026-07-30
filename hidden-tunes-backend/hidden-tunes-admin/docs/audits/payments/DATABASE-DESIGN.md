# Hidden Tunes Payments — Database Design

## Status

**Not migrated yet.** Phase B will add SQL under `supabase/migrations/` on project `kojcyswxfuikxmqntwye`.

## Tables

### payment_customers
`id`, `user_id` (uuid → auth.users), `provider`, `provider_customer_id`, `email`, `country`, `currency`, `created_at`, `updated_at`  
Unique: `(provider, provider_customer_id)`, `(provider, user_id)` where applicable.

### payment_products
`id`, `code`, `platform`, `provider`, `provider_product_id`, `provider_price_id`, `access_type`, `duration_days`, `currency`, `amount`, `active`, `metadata`, timestamps  
Unique: `(provider, provider_product_id)` when set; unique `code`.

### payment_transactions
`id`, `user_id`, `provider`, `provider_transaction_id`, `provider_order_id`, `provider_subscription_id`, `internal_reference`, `product_code`, `amount`, `currency`, `status`, `payment_method`, `country`, `raw_status`, `verified_at`, timestamps  
Unique: `(provider, provider_transaction_id)` where not null; unique `internal_reference`.

### subscriptions
`id`, `user_id`, `provider`, `provider_subscription_id`, `product_code`, `status`, `current_period_start`, `current_period_end`, `cancel_at_period_end`, `cancelled_at`, `grace_period_end`, timestamps  
Unique: `(provider, provider_subscription_id)`.

### entitlements
`id`, `user_id`, `entitlement_key`, `source`, `source_reference`, `status`, `starts_at`, `expires_at`, `revoked_at`, `metadata`, timestamps  
Index: `(user_id, entitlement_key, status, expires_at)`.

### payment_events
`id`, `provider`, `provider_event_id`, `event_type`, `status`, `received_at`, `processed_at`, `processing_error`, `payload_hash`  
Unique: `(provider, provider_event_id)`.

### entitlement_audit_log
`id`, `user_id`, `previous_state`, `new_state`, `reason`, `provider`, `reference`, `actor`, `created_at`.

## RLS sketch

- Service role: full access for webhook processors.
- Authenticated user: `SELECT` own entitlements / transactions summary only.
- No client `INSERT`/`UPDATE` on ledger tables.

## Rollback

Each Phase B migration is additive; rollback drops new tables in reverse order. No alteration of catalogue tables required for foundation.