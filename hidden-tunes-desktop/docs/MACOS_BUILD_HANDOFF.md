# Hidden Tunes Desktop 1.0.0 — macOS build handoff

This checkout is the portable source for macOS packaging. It must be clean and at the SHA recorded in `MACOS_BASELINE_SHA.txt` before building.

## Toolchain

- Node.js: 24.15.0 recommended
- npm: 11.12.1 recommended
- Electron: 42.2.0 (lockfile)
- electron-builder: 26.8.1 (lockfile)
- macOS: 12 Monterey or later for Electron 42; use the newest macOS supported by the 2019 Intel Mac
- Xcode: current Xcode supported by that macOS, including Xcode Command Line Tools
- JDK: none

Do not copy or reuse Windows `node_modules`, `dist`, `release`, Electron binaries, or caches. Run `npm ci` on the Mac.

## SSD filesystem warning

The SanDisk SSD was detected as NTFS on Windows. Standard macOS mounts NTFS read-only. Before building directly on the SSD, verify a supported writable NTFS driver is installed and test write access. Do not reformat the SSD as part of this handoff. If the volume is read-only, clone the committed SHA to a writable APFS/exFAT volume instead.

## On the 2019 Intel Mac

1. Connect the SSD and open Terminal.
2. Locate it with `ls /Volumes`.
3. Change directory using the actual mounted name: `cd "/Volumes/<SSD>/HiddenTunes/Desktop/HiddenTunes-Desktop-1.0.0/hidden-tunes-desktop"`.
4. Run `git rev-parse HEAD` and compare it with `../../../Handoff/MACOS_BASELINE_SHA.txt`.
5. Run `git status --short`; expected output is empty.
6. Run `xcode-select -p`; install the Command Line Tools if missing.
7. Verify `node --version` and `npm --version`.
8. Run `npm ci`.
9. Run `npm run build`.
10. With production signing/notarization credentials installed, run `npm run dist:mac:intel`. Without credentials, use `npm run dist:mac:intel:unsigned` for local runtime validation only.
11. Locate `release/Hidden-Tunes-Desktop-1.0.0-mac-x64.dmg` (or the exact configured architecture-aware name).
12. Mount the DMG, drag Hidden Tunes Desktop to Applications, then execute the native validation matrix.

The configured commands are:

- Intel: `npm run dist:mac:intel`
- Apple Silicon: `npm run dist:mac:arm64`
- Universal: `npm run dist:mac:universal`

Unsigned local-validation equivalents append `:unsigned`. Unsigned artifacts are not public-release artifacts and will not pass normal Gatekeeper distribution checks.

ARM64 runtime validation requires Apple Silicon hardware. A Universal filename is not proof; verify both slices with `lipo -info` on the generated executable.

Signing/notarization credentials are intentionally absent. With `mac.notarize` enabled, a release build requires valid Apple credentials. Do not use fake production credentials.

Auto-update is not configured and is not required for manual 1.0.0 DMG distribution.
