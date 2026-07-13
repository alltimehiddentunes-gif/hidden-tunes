# Hidden Tunes Mobile Baseline Manifest

## Source
- Workspace: `C:\Users\Wills\Desktop\HiddenTunes-CLEAN-1.0.142`
- Protected copy: `C:\Users\Wills\Desktop\HiddenTunes-CLEAN-1.0.142-PROTECTED`
- Branch: `protected-clean-1.0.142-final`
- Tag: `protected-clean-1.0.142-final`
- Commit: `62dc6724ae7c22e1a8f2a2c9dab3e91bfabf27d9`
- Repository remote: `https://github.com/alltimehiddentunes-gif/hidden-tunes.git`

## Metro identity (at protection time)
- Metro-served workspace: `C:\Users\Wills\Desktop\HiddenTunes-CLEAN-1.0.142`
- Metro process ID: `20780`
- Metro port: `8081`

## Toolchain
- Node version: `v24.15.0`
- npm version: `11.12.1`
- Expo SDK: `~56.0.8`
- EAS CLI version: `20.5.1`
- React Native version: `0.85.3`

## App identity
- App version: `1.0.1` (`app.json`)
- iOS bundle identifier: `com.hiddentunes.app`
- iOS build number: `1.0.0`
- Android package: `com.hiddentunes.app`
- Android version code: `3`

## Repair queue (code complete)
- Home vertical grid: `c8979a1`, `31f3491`
- TV search: `c00accf`
- TV footer / bottom-tab overlap: `615d687`, `31f3491`
- TV Next / Pause / Resume / Previous: `236221b`
- TV double-loading on tap: `63a7524`

## Verified features
- Home: **code restored — physical device not verified in this session**
- Explore: **not re-tested in this session**
- Player: **not re-tested in this session**
- Library: **not re-tested in this session**
- TV: **regressions repaired in code — physical device not verified in this session**
- Profile: **footer inset restored — physical device not verified in this session**
- Radio: **not re-tested in this session**
- Podcasts: **not re-tested in this session**
- Audiobooks: **not re-tested in this session**
- Motivationals: **routes intact — not re-tested in this session**
- Lectures: **not re-tested in this session**
- MiniPlayer: **not re-tested in this session**
- Background playback: **protected systems not modified**
- Lock-screen playback: **protected systems not modified**

## Validation
- npm ci: **pending on protected copy**
- Expo Doctor: **pending on protected copy**
- TypeScript: **pending on protected copy**
- Tests: **no dedicated test script in package.json beyond lint/typecheck**
- Android preview build: **not run in this session**
- Android production build: **not run in this session**
- iOS preview build: **not run in this session**
- iOS production build: **not run in this session**

## Build references
- Android build ID: _none_
- iOS build ID: _none_

## Standalone audit
- No imports from other Hidden Tunes folders detected in source scan
- Production API URLs are embedded in project services/constants (`admin.hiddentunes.com`, `hidden-tunes-api.onrender.com`, etc.)
- Required config present: `package.json`, `package-lock.json`, `app.json`, `app.config.js`, `eas.json`, `babel.config.js`, `metro.config.js`, `tsconfig.json`
- Assets referenced by Expo config exist under `assets/images/`
- Environment variables documented in `.env.example`

## Protection rules
- Never develop directly on `protected-clean-1.0.142-final`.
- Never force-update `protected-clean-1.0.142-final` tag.
- Use separate worktrees for future changes (`HiddenTunes-NEXT`).
