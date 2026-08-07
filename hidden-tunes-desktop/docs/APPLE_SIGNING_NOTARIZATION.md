# Apple signing and notarization handoff

Public macOS distribution requires Apple Developer Program membership, a Developer ID Application certificate with its private key, Xcode/Command Line Tools, and valid notarization credentials. Credentials are not included in this repository.

1. Install the Developer ID Application certificate and private key into the build user's Keychain.
2. Confirm the identity with `security find-identity -v -p codesigning`.
3. Provide the Apple Team ID and one supported notarization credential method described in `MACOS_REQUIRED_ENV.md`.
4. Build the appropriate DMG using the package scripts.
5. Verify the app with `codesign --verify --deep --strict --verbose=2 "<app>"`.
6. Inspect it with `codesign -dv --verbose=4 "<app>"` and `codesign -d --entitlements :- "<app>"`.
7. If manual submission is necessary, use `xcrun notarytool submit "<dmg>" --wait` with a securely stored Keychain profile or App Store Connect credentials.
8. Inspect Apple's result. Only after acceptance, run `xcrun stapler staple "<dmg>"` and `xcrun stapler validate "<dmg>"`.
9. Verify Gatekeeper with `spctl --assess --type execute --verbose "<app>"` on a clean or isolated Mac.

Do not claim signing, notarization, stapling, or Gatekeeper approval until these commands succeed against the actual artifact.
