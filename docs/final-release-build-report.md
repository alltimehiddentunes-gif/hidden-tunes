# Final Release Build Report

Date: 2026-06-22  
Branch: `carplay-scene-safe-test`  
Local HEAD: `44c7194` (`44c7194207979f5caae4137ce55e85d803e20806`)  
Pushed commit: `44c7194` — *Document final release builds*

## Summary

| Step | Result |
|------|--------|
| Git push | **SUCCESS** |
| Android signing verification | **MISMATCH — build blocked** |
| Android production build | **NOT STARTED** |
| Apple PLA | **No blocker** |
| iOS production build | **FINISHED** |
| Release readiness | **NO** |

---

## Validation

| Check | Result |
|-------|--------|
| `npm run typecheck` | **PASS** (prior rollout) |
| `git diff --check` | **PASS** (prior rollout) |
| Working tree | Clean except untracked `docs/local-favorites-work.patch` |

---

## Git / Push

```
git push origin carplay-scene-safe-test
→ 1a8b43d..44c7194  carplay-scene-safe-test -> carplay-scene-safe-test
```

Local and `origin/carplay-scene-safe-test` are aligned at `44c7194`.

### Commits pushed (6)

```
44c7194 Document final release builds
4de0619 Eliminate heat and navigation stalls
68041c9 Add unified favorites across media types
ec25caa Reduce tap to play latency
028b7ba Build infinite discovery architecture
3fb4a90 Make podcast discovery functional with mature access
```

---

## Android Signing Verification

Verified by downloading the most recent finished production AAB (`083ceb47-201d-4019-a938-58792eeb8e37`) and inspecting its signing certificate with `keytool`.

| Field | Value |
|-------|-------|
| Expected Google Play upload SHA1 | `D2:5C:95:C3:2F:A8:5B:3C:8A:81:1D:66:A3:13:D8:6B:8D:46:D3:FD` |
| Current EAS production AAB SHA1 | `59:97:EB:A2:88:B7:F3:F0:77:9A:9C:F4:23:7B:F0:FE:D3:9C:64:12` |
| Verdict | **MISMATCH** |

**Action taken:** Android production build was **not started**. Do **not** upload any new AAB signed with the current EAS keystore to Google Play until credentials are corrected via `eas credentials -p android`.

---

## Android Production Build

| Field | Value |
|-------|-------|
| Status | **NOT STARTED** (blocked by signing mismatch) |
| Build ID | N/A |
| Build URL | N/A |
| Artifact type | N/A |
| Artifact URL | N/A |

---

## Apple Verification

| Check | Result |
|-------|--------|
| Apple PLA blocker | **None encountered** |
| Distribution certificate | Valid until 2027-05-26 |
| Provisioning profile | Active (updated 2026-06-21) |
| EAS remote credentials | Ready |

---

## iOS Production Build

Command:

```sh
eas build --platform ios --profile production --clear-cache --non-interactive
```

| Field | Value |
|-------|-------|
| Status | **FINISHED** |
| Build ID | `b2a1acbe-15b4-4e68-9577-b8e689b77a5d` |
| Build URL | https://expo.dev/accounts/hiddentunes_1/projects/hidden-tunes/builds/b2a1acbe-15b4-4e68-9577-b8e689b77a5d |
| Artifact type | `.ipa` |
| Artifact URL | https://expo.dev/artifacts/eas/e5b5quXjoFtafWkQqb91KsZVnFkkF7hRJ9hIuC7_620.ipa |
| App version | 1.0.1 |
| Build number | 1.0.118 |
| Git commit | `44c7194207979f5caae4137ce55e85d803e20806` |
| Completed | 2026-06-22T11:42:42Z |

---

## Known Blockers

1. **Android upload-key SHA1 mismatch** — current EAS keystore does not match Google Play expected upload certificate.
2. **No Android artifact for HEAD `44c7194`** — Play rollout cannot proceed from this release until signing is fixed and a new AAB is built.

## Unblock Android

1. Run `eas credentials -p android` and align keystore with Play Console upload certificate (`D2:5C:95:...`).
2. Re-verify SHA1 from a test AAB before upload.
3. Run:

```sh
eas build --platform android --profile production --clear-cache --non-interactive
```

## Release Readiness Verdict

**NO**

- iOS production build for `44c7194` is ready for TestFlight submission.
- Android release is **not ready** due to signing-key mismatch.
- Do **not** upload Android AAB until signing is corrected and verified.
