# Hidden Tunes — iOS Exact Metro Production Report

Date: 2026-07-31

## 1. Workspace proof

| Field | Value |
| --- | --- |
| Path | `D:\HiddenTunes\Active\HiddenTunes-CLEAN-1.0.142` |
| Git root | `D:/HiddenTunes/Active/HiddenTunes-CLEAN-1.0.142` |
| Branch | `fix/library-content-type-safe` |
| Remote | `https://github.com/alltimehiddentunes-gif/hidden-tunes.git` |
| Metro | `8081` (SSD) |

## 2. Branch and initial SHA

Starting tip (user-verified): `727d5edee9dcb39e0523b5908c9a3118f31412a2`

## 3. Final release SHA

`984e66da54b8c517c018671b5d19fc7997b4dc2f`

Commit: `release: align iOS production EAS with Metro Sports fixtures`

## 4. Local/remote SHA equality

Local HEAD = remote `origin/fix/library-content-type-safe` = `984e66d…` at build time. Tree clean.

## 5. App-source-lock comparison

`3fe6c9f..727d5ed`: lock docs + BOM strip + unused skip-counter only.  
`727d5ed..984e66d`: EAS fixtures parity + Expo package align + release docs.  
No Podcast/Sports feature reverts.

## 6. Metro capability manifest

See `audit/release/IOS-PRODUCTION-METRO-PARITY-MANIFEST.md`.

## 7. EAS production capability values

| Variable | Production |
| --- | ---: |
| Sports enabled / pilot / full UI | true |
| Sports fixtures | **true** (parity fix) |
| Sports TV | true |
| Sports streams | **false** |
| Live scores / notifications / dev fixtures | false |

Mature Podcasts / autoplay: code-path based (no env flag); age gate intact.

## 8. Metro-versus-production parity table

| Capability | Metro | Production EAS | Match |
| --- | --- | --- | --- |
| Mature Podcasts + age gate | source | source | Yes |
| includeMature / continuation | source | source | Yes |
| Sports UI | true | true | Yes |
| Fixtures | true | **true** | Yes (was false on prior build) |
| Sports TV | true | true | Yes |
| Fixture streams | false | false | Yes |

## 9. Production API preflight

| Check | Result |
| --- | --- |
| Mature catalog | Pass (~1771) |
| Episode pipeline / includeMature | Pass |
| Mature play gate | Pass |
| Sports datapath | Pass (`watchLivePresent: false`) |
| Sports grid + TV | Pass |

## 10. Validation results

| Check | Result |
| --- | --- |
| TypeScript | Pass |
| Targeted ESLint | Pass (0 errors) |
| Podcast critical suites | Pass |
| Sports critical suites | Pass |
| Expo Doctor | **21/21** (after `expo-web-browser` / `react-native-screens` align) |
| `expo install --check` | Pass |

## 11. Version / build number

```text
Marketing version: 1.0.1
Previous iOS build: 1.0.193
New iOS build: 1.0.194
```

## 12. Resolved production configuration

See `audit/release/IOS-PRODUCTION-RESOLVED-CONFIG.md`.

## 13. Build-source content proof

See `audit/release/IOS-BUILD-SOURCE-CONTENT-PROOF.md`.

## 14. iOS build ID and URL

- ID: `a64d3bda-26be-4771-b6d5-3c427e9645ac`
- URL: https://expo.dev/accounts/hiddentunes_1/projects/hidden-tunes/builds/a64d3bda-26be-4771-b6d5-3c427e9645ac
- IPA: https://expo.dev/artifacts/eas/lKhHNiRPm-gj6j2fQB5t1RzsqnDTVNVILID7BDwvyws.ipa

## 15. Build SHA and fingerprint

- Git SHA: `984e66da54b8c517c018671b5d19fc7997b4dc2f` (**matches** release tip)
- Fingerprint: `377b820b73e40660ce8f46493fbea251bd99b06e`

## 16. Artifact audit

See `audit/release/IOS-PRODUCTION-ARTIFACT-AUDIT.md` — **approve for submit**.

## 17. Submission ID and status

- Submission ID: `d6389a86-9b8e-4cc8-bbeb-6d9c24c0f4b9`
- URL: https://expo.dev/accounts/hiddentunes_1/projects/hidden-tunes/submissions/d6389a86-9b8e-4cc8-bbeb-6d9c24c0f4b9
- Status: Uploaded to App Store Connect successfully

## 18. App Store Connect processing

Apple is processing the binary (email when ready). Not released publicly.

## 19. TestFlight testing instructions

1. Wait for ASC processing (~5–10+ minutes).
2. Open https://appstoreconnect.apple.com/apps/6773324462/testflight/ios
3. Install build **1.0.1 (1.0.194)** on a device.
4. Verify Mature Podcasts (age gate → catalog → episodes → Play Latest / Shuffle → auto-next).
5. Verify Sports filters, 2-col grid, Upcoming/Results, Live Sports TV → existing TV player.
6. Confirm no fixture Watch Live / streams.

## 20. Remaining limitations

- Public App Store release not approved / not performed.
- No Android work in this task.
- Physical device smoke still requires TestFlight install.
- Expo install warned it could not auto-add `expo-web-browser` plugin to dynamic `app.config.js` (package version aligned; prior builds already functioned).

## 21–24. Confirmations

- No backend deployment
- No database migration
- No Android build
- Fixture streams remain disabled
- Mature age gate remains intact
- No reset / stash / rebase / force-push
