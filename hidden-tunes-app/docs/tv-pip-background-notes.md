# Hidden Tunes TV PiP And Background Notes

Hidden Tunes TV now keeps TV playback state in an isolated TV playback context. TV metadata is loaded first, and stream URLs are fetched only after the user taps a channel.

Picture-in-Picture and background playback need native support beyond Expo Go:

- iOS: enable Background Modes with Audio, AirPlay, and Picture in Picture in the native target, then verify WebView or native video playback behavior in an EAS/dev build.
- Android: enable Activity Picture-in-Picture support and media session handling in the native project, then verify lifecycle behavior in an EAS/dev build.
- Expo Go is not a reliable final validation target for full PiP/background TV playback.

The current implementation avoids native hacks and keeps TV playback isolated from music playback. Music is paused when TV starts; stopping TV does not auto-resume music.
