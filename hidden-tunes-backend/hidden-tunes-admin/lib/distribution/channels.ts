export const PLATFORMS = {
  android: 'Android', windows: 'Windows', macos: 'macOS', linux: 'Linux',
  ios: 'iOS', web: 'Web', fire: 'Fire',
} as const;

export type DistributionPlatform = keyof typeof PLATFORMS;
export type DistributionStatus = 'LIVE' | 'UNDER REVIEW' | 'IN CERTIFICATION' | 'PREPARED' | 'BLOCKED' | 'PARKED' | 'UNKNOWN';
export type DistributionChannel = {
  id: string; name: string; platform: DistributionPlatform; status: DistributionStatus;
  version: string | null; publicUrl: string | null; blocker: string; nextAction: string;
  reviewStatus: string; lastVerified: string; source: string;
};

// Frozen owner/evidence baseline. These are release states, never metric seeds.
// A date means the dated evidence was reviewed, not a fresh Store API check.
const verified = '2026-09-07';
const directSource = 'HiddenTunes-Download-Center-20260907/PRODUCTION-RESULT.md (7 September 2026)';
const liveDirect = { status: 'LIVE' as const, blocker: 'None recorded', nextAction: 'Keep the published immutable artifact available.', reviewStatus: 'Published direct release', lastVerified: verified, source: directSource };

export const CHANNELS: readonly DistributionChannel[] = [
  { id: 'android_direct', name: 'Android Direct', platform: 'android', version: '1.0.2', publicUrl: 'https://downloads.hiddentunes.com/android/1.0.2/Hidden-Tunes-1.0.2-Android-Direct.apk', ...liveDirect },
  { id: 'google_play', name: 'Google Play', platform: 'android', status: 'UNKNOWN', version: null, publicUrl: null,
    blocker: 'Current public/review status is not verified in the 7 September records.', nextAction: 'Verify the existing Play release without changing the review.', reviewStatus: 'Historical closed-testing review only; current status unverified', lastVerified: verified,
    source: 'Download Center DEPLOYMENT-READINESS.md (7 September); ANDROID-1.0.215-CLOSED-TEST-REPORT.md (25 August 2026, historical)' },
  { id: 'amazon_fire', name: 'Amazon Appstore', platform: 'fire', status: 'BLOCKED', version: '1.0.2', publicUrl: null,
    blocker: 'Owner export decision outstanding; draft not submitted.', nextAction: 'Resolve the existing export attestation decision.', reviewStatus: 'Prepared draft; no app-review submission', lastVerified: verified,
    source: 'HiddenTunes-Amazon-20260907/FINAL-CURRENT-STATUS.md (7 September 2026)' },
  { id: 'huawei', name: 'Huawei AppGallery', platform: 'android', status: 'BLOCKED', version: '1.0.2', publicUrl: null,
    blocker: 'Huawei identity verification is pending; no app ID or upload.', nextAction: 'Await the existing Huawei identity review.', reviewStatus: 'Account verification pending; app not submitted', lastVerified: verified,
    source: 'HiddenTunes-Huawei-20260907/HUAWEI-STAGING-MATRIX.md (7 September 2026)' },
  { id: 'samsung', name: 'Samsung Galaxy Store', platform: 'android', status: 'PARKED', version: '1.0.2', publicUrl: null,
    blocker: 'Owner parked channel after corporate seller eligibility gate.', nextAction: 'Keep parked until the owner resumes this channel.', reviewStatus: 'No app submission', lastVerified: verified,
    source: 'HiddenTunes-Amazon-20260907/FINAL-CURRENT-STATUS.md; Samsung SUBMISSION-STATUS.md (7 September 2026)' },
  { id: 'windows_direct', name: 'Windows Direct', platform: 'windows', version: '1.0.1', publicUrl: 'https://downloads.hiddentunes.com/desktop/windows/1.0.1/Hidden-Tunes-Desktop-1.0.1-win-x64.exe', ...liveDirect },
  { id: 'microsoft_store', name: 'Microsoft Store', platform: 'windows', status: 'LIVE', version: '1.0.1.0', publicUrl: 'https://apps.microsoft.com/detail/9N9XGSTD8889',
    blocker: 'None recorded', nextAction: 'Keep the current public Store release available.', reviewStatus: 'Published, discoverable and available to acquire; Store ID 9N9XGSTD8889; owner-confirmed', lastVerified: '2026-09-08', source: 'docs/distribution-microsoft-store-live-2026-09-08.md (owner-confirmed 8 September 2026)' },
  { id: 'winget', name: 'WinGet', platform: 'windows', status: 'UNDER REVIEW', version: '1.0.1', publicUrl: 'https://github.com/microsoft/winget-pkgs/pull/430553',
    blocker: 'PR 430553 remains open; public source publication pending.', nextAction: 'Await review; verify source availability after merge.', reviewStatus: 'Open / review required; validation and CLA passed', lastVerified: verified,
    source: 'HiddenTunes-WinGet-Submission-20260906/CURRENT-SUBMISSION-STATUS.md (7 September 2026)' },
  { id: 'chocolatey', name: 'Chocolatey', platform: 'windows', status: 'UNDER REVIEW', version: '1.0.1', publicUrl: 'https://community.chocolatey.org/packages/hidden-tunes',
    blocker: 'Package is unlisted until approval.', nextAction: 'Await the existing automated/moderator review; do not repeat upload.', reviewStatus: 'Submitted 7 September 19:10 UTC; pending automated review', lastVerified: verified,
    source: 'HiddenTunes-Chocolatey-Scoop-20260906/CHOCOLATEY-SUBMISSION-RESULT.md (7 September 2026)' },
  { id: 'scoop', name: 'Scoop', platform: 'windows', status: 'LIVE', version: '1.0.1', publicUrl: 'https://github.com/alltimehiddentunes-gif/scoop-hidden-tunes',
    blocker: 'None recorded', nextAction: 'Maintain the publisher bucket.', reviewStatus: 'Published in publisher bucket; not central Extras', lastVerified: verified,
    source: 'HiddenTunes-Chocolatey-Scoop-20260906/SCOOP-PUBLISHED-RESULT.md (7 September 2026)' },
  { id: 'macos_direct', name: 'macOS Direct', platform: 'macos', version: '1.0.1', publicUrl: 'https://downloads.hiddentunes.com/desktop/1.0.1/macos/Hidden-Tunes-Desktop-1.0.1-mac-universal.dmg', ...liveDirect },
  { id: 'homebrew', name: 'Homebrew', platform: 'macos', status: 'LIVE', version: '1.0.1', publicUrl: 'https://github.com/alltimehiddentunes-gif/homebrew-hidden-tunes',
    blocker: 'None recorded', nextAction: 'Maintain the publisher tap.', reviewStatus: 'Published in publisher tap; not central homebrew-cask', lastVerified: verified,
    source: 'HiddenTunes-Homebrew-1.0.1-20260906/PUBLISHED-RESULT.md (7 September 2026)' },
  { id: 'linux_appimage', name: 'Linux AppImage', platform: 'linux', version: '1.0.1', publicUrl: 'https://downloads.hiddentunes.com/desktop/linux/1.0.1/Hidden-Tunes-Desktop-1.0.1-x86_64.AppImage', ...liveDirect },
  { id: 'linux_deb', name: 'Linux DEB', platform: 'linux', version: '1.0.1', publicUrl: 'https://downloads.hiddentunes.com/desktop/linux/1.0.1/Hidden-Tunes-Desktop-1.0.1-amd64.deb', ...liveDirect },
  { id: 'snap', name: 'Snap', platform: 'linux', status: 'UNDER REVIEW', version: '1.0.1', publicUrl: null,
    blocker: 'Revision 1 is private and awaiting manual interface review.', nextAction: 'Await review of the existing revision; publication is a separate step.', reviewStatus: 'Manual review pending; no channel release requested', lastVerified: verified,
    source: 'HiddenTunes-Linux-Distribution-20260906/snap/SNAP-SUBMISSION-RESULT.md (7 September 2026)' },
  { id: 'flathub', name: 'Flathub', platform: 'linux', status: 'PREPARED', version: '1.0.1', publicUrl: null,
    blocker: 'Source-build eligibility, release metadata and final submission remain unresolved.', nextAction: 'Resolve eligibility and metadata before independent submission.', reviewStatus: 'Prepared packaging; not submitted', lastVerified: verified,
    source: 'HiddenTunes-Packaging-20260907/OWNER-ACTIONS.md; flathub/SOURCE-ELIGIBILITY-NOTE.md (7 September 2026)' },
  { id: 'aur', name: 'AUR', platform: 'linux', status: 'BLOCKED', version: '1.0.1', publicUrl: null,
    blocker: 'AUR new account registration is temporarily closed.', nextAction: 'Wait for registration availability or an existing owner account.', reviewStatus: 'Qualified package; not published', lastVerified: verified,
    source: 'HiddenTunes-Linux-Distribution-20260906/aur/REGISTRATION-CLOSED-20260907.md (7 September 2026)' },
  { id: 'apple_app_store', name: 'Apple App Store', platform: 'ios', status: 'UNKNOWN', version: null, publicUrl: null,
    blocker: 'Current Store state is not established by the dated evidence.', nextAction: 'Verify the existing App Store record without changing it.', reviewStatus: 'Existing submission preserved; current status unverified', lastVerified: verified,
    source: 'HiddenTunes-Distribution-20260906-STATUS.md protected-state note (6–7 September 2026); no current Store receipt' },
];