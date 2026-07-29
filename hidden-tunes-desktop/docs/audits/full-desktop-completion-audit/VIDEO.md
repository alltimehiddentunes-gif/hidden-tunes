# Video Audit

## Owners

- Service: `src/lib/tv/HtmlVideoPlaybackService.ts`, `tvVideoPlayback.ts`
- Surface resolver: `src/lib/player/resolveActivePlayerSurface.ts` (**untracked WIP**)
- TV UI: `TvVideoSurface.tsx`, `TvNowPlayingPanel.tsx`
- Transport helpers: `src/lib/tv/tvChannelTransport.ts` (**untracked**)

## TV

- Shared singleton video element
- Fullscreen + Picture-in-Picture in `TvNowPlayingPanel`
- Rail mounts from active TV session (route-independent intent)
- Static TV transport sync script: PASS
- LIVE badges in browse UI are decorative, not stream-state driven

## Sports

- Uses same video service for playable fixtures
- **No dedicated Sports video mount UI** in sports components
- Right rail stays audio player unless track classified as TV
- Risk: sports stream may play without visible video surface

## Lectures / Motivationals

- Video-tagged items can use video path
- Lecture series page can mount TV video element
- Surface consistency weaker than TV destination

## Verdict

TV video path is mostly production-capable pending live stream QA. Sports video product is **not** complete. Shared ownership is correct; surface coverage is incomplete outside TV.
