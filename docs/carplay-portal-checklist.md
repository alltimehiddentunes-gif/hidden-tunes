# CarPlay Apple Developer Portal Checklist

Bundle ID: **`com.hiddentunes.app`**

Entitlement for this phase: **`com.apple.developer.carplay-audio`**

Do **not** enable CarPlay Video on the App ID for the first CarPlay audio build.

---

## 1. Open Identifiers

1. Sign in to [Apple Developer](https://developer.apple.com/account)
2. Go to **Certificates, Identifiers & Profiles**
3. Open **Identifiers**
4. Select **`com.hiddentunes.app`**

## 2. Enable CarPlay Audio on the App ID

1. Under **App Services** / Capabilities, find **CarPlay Audio App**
2. Enable **CarPlay Audio App**
3. Confirm it maps to entitlement key `com.apple.developer.carplay-audio`
4. Leave **CarPlay Video** disabled for this phase
5. Click **Save**
6. Confirm any warning about regenerating provisioning profiles

> Account-level entitlement approval does **not** automatically attach to this App ID. The App ID must be updated explicitly.

## 3. Regenerate Development profile

1. Open **Profiles**
2. Find the Development profile used for `com.hiddentunes.app`
3. Edit or create a new Development profile
4. Ensure App ID = `com.hiddentunes.app` (with CarPlay Audio enabled)
5. Select the correct Development certificate(s) and devices
6. Generate / download
7. Discard any older Development profile created **before** CarPlay Audio was enabled

## 4. Regenerate Ad Hoc / App Store distribution profiles

1. For internal/TestFlight/Ad Hoc: regenerate the Ad Hoc (or equivalent) profile for `com.hiddentunes.app`
2. For App Store: regenerate the App Store distribution profile
3. Confirm the profile’s App ID shows CarPlay Audio
4. Download / upload to EAS credentials or Xcode

## 5. Refresh local / EAS credentials

### Xcode

1. Xcode → Settings → Accounts → Download Manual Profiles (or refresh)
2. Target **HiddenTunes** → Signing & Capabilities
3. Confirm **CarPlay Audio** capability / entitlement is present
4. Confirm the selected profile is the newly regenerated one

### EAS

1. Refresh iOS credentials for the project
2. Ensure distribution credentials are re-synced after profile regeneration
3. Do not build with cached credentials that still point at a pre-approval profile

## 6. Verify signed binary (after next build)

```bash
codesign -d --entitlements :- /path/to/HiddenTunes.app
```

Must include:

```xml
<key>com.apple.developer.carplay-audio</key>
<true/>
```

Embedded profile check:

```bash
security cms -D -i /path/to/HiddenTunes.app/embedded.mobileprovision | grep -A2 carplay-audio
```

## 7. CarPlay home icon expectation

Only after:

1. App ID has CarPlay Audio enabled
2. Provisioning profile includes the entitlement
3. Signed app entitlements include `com.apple.developer.carplay-audio = true`
4. App declares `CPTemplateApplicationScene` + template UI

…will Hidden Tunes appear on the CarPlay home screen.

## Status for this preparation branch

| Step | Status |
|------|--------|
| Code entitlement source configured | Done |
| Scene + templates prepared | Done |
| App ID CarPlay Audio enabled in portal | **Manual — still required** |
| Profiles regenerated | **Manual — still required** |
| iOS build | **Not started (by instruction)** |
