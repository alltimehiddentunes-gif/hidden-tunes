# macOS environment variables

No secrets are committed or copied by this handoff.

## Application configuration

- `VITE_SUPABASE_URL`: public runtime project URL; normally required for connected catalog/auth behavior.
- `VITE_SUPABASE_ANON_KEY`: public anonymous client key; normally required for connected catalog/auth behavior.
- `VITE_PUBLIC_SUPABASE_URL`, `VITE_PUBLIC_SUPABASE_ANON_KEY`: optional aliases.
- `VITE_CATALOG_ADMIN_API_URL`: optional catalog endpoint override.
- `HT_SPORTS_PRIVATE_PILOT_TOKEN`, `VITE_SPORTS_PRIVATE_PILOT_TOKEN`: protected/deferred Sports pilot only; not required for this macOS handoff.
- `HT_DOWNLOADS_TEST_ALLOW_HTTP`: test-only; never set in production.

## Signing and notarization

Install credentials securely on the Mac or in CI. Do not store them on the SSD or in Git.

- Certificate: `CSC_LINK`, `CSC_KEY_PASSWORD` (when using an exported certificate)
- Apple ID: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
- App Store Connect API: `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, `APPLE_TEAM_ID`
- Keychain profile: `APPLE_KEYCHAIN`, `APPLE_KEYCHAIN_PROFILE`, `APPLE_TEAM_ID`

See `APPLE_SIGNING_NOTARIZATION.md` before public distribution.
