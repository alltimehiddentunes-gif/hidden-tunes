# iOS Production — Artifact Audit

Date: 2026-07-31

## Build identity

| Field | Value |
| --- | --- |
| EAS build ID | `a64d3bda-26be-4771-b6d5-3c427e9645ac` |
| Status | `FINISHED` |
| URL | https://expo.dev/accounts/hiddentunes_1/projects/hidden-tunes/builds/a64d3bda-26be-4771-b6d5-3c427e9645ac |
| IPA | https://expo.dev/artifacts/eas/lKhHNiRPm-gj6j2fQB5t1RzsqnDTVNVILID7BDwvyws.ipa |
| App version | `1.0.1` |
| iOS build number | `1.0.194` |
| Git SHA | `984e66da54b8c517c018671b5d19fc7997b4dc2f` |
| Fingerprint | `377b820b73e40660ce8f46493fbea251bd99b06e` |
| Profile | `production` |
| Distribution | `STORE` |
| Expo project | `9cf7fc48-6bf7-4ccc-8fe1-8b793530e70c` (`hiddentunes_1` / `hidden-tunes`) |
| Bundle ID | `com.hiddentunes.app` |
| Apple Team | `299CMT9CHH` |

## Parity checks

| Check | Result |
| --- | --- |
| Build SHA equals pushed release SHA | **Pass** (`984e66d…`) |
| Hidden Tunes owner/slug/project | Pass |
| Not development client | Pass (`developmentClient: false`, distribution STORE) |
| Production Sports flags in commit | Pass — fixtures **true**, TV **true**, streams **false** |
| Mature Podcast source in SHA | Pass (unchanged from app-source lock + tip) |
| Sports grid + TV handoff in SHA | Pass |
| No AfriMeetup | Pass |
| No localhost API hosts in catalog clients | Pass (`admin.hiddentunes.com` / `hiddentunes.com`) |
| CarPlay entitlements in app.json | Pass (`carplay-audio` / `carplay-video`) |
| Background audio | Pass (`UIBackgroundModes: audio`, expo-video PiP/background) |
| Export compliance | `ITSAppUsesNonExemptEncryption: false` |
| Fixture streams | Disabled in EAS env at this SHA |

## Verdict

**Approve for submission** of build `a64d3bda-26be-4771-b6d5-3c427e9645ac` only.
