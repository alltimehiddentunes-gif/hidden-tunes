# HIDDENTUNES CRASH/FREEZE REGRESSION GATE

Release candidate:

- Version/build:
- Commit SHA:
- Runtime/channel:
- OTA or native build ID:
- iPhone model/iOS:
- Android model/version:
- Tester/date/time:

For every row record `PASS` or `FAIL`, plus any freeze, crash, blank screen,
duplicate navigation, reload loop, playback corruption, or unhandled error.

| # | Physical-device scenario | iPhone | Android | Evidence/notes |
|---|---|---|---|---|
| 1 | Cold launch ×10 | | | |
| 2 | Warm launch ×10 | | | |
| 3 | Home ↔ Explore ↔ Library ↔ Player rapid navigation | | | |
| 4 | MiniPlayer title ×10 rapid taps | | | |
| 5 | MiniPlayer artwork ×10 rapid taps | | | |
| 6 | Play/Pause ×20 | | | |
| 7 | Next ×20 | | | |
| 8 | Previous ×20 | | | |
| 9 | Alternating Next/Previous ×20 | | | |
| 10 | Repeated seek during playback | | | |
| 11 | Player open/close ×10 | | | |
| 12 | Lyrics open/close ×10 | | | |
| 13 | Repeated seek from Lyrics | | | |
| 14 | Change track while Lyrics is open | | | |
| 15 | Background/foreground ×10 | | | |
| 16 | Device lock/unlock ×10 while playing | | | |
| 17 | Network OFF during playback and catalog load | | | |
| 18 | Network ON recovery | | | |
| 19 | Rapid song switching across surfaces | | | |
| 20 | Logout/login restoration | | | |
| 21 | TV open/play/close/reopen ×20 | | | |
| 22 | Continuous playback for 15–30 minutes | | | |

## Mandatory stop conditions

Do not publish when any required platform reproduces a crash, whole-app freeze,
white/blank screen, reload loop, navigation storm, queue corruption, permanent
lock, stale old-track commit, unhandled rejection, or severe UI deadlock.

Production crash reporting is not currently configured. Preserve sanitized
device logs and screen recordings for every failure; never include credentials,
tokens, email addresses, private URLs, or personal catalog data.

## Result

- iPhone physical gate: `PASS / FAIL / PENDING`
- Android physical gate: `PASS / FAIL / PENDING`
- CRASH/FREEZE REGRESSION GATE: `PASS / FAIL / PENDING`
- Release authorized by:
- Authorization time:
