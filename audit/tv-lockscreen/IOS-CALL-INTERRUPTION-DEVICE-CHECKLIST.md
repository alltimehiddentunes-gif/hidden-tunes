# iOS Call Interruption — Physical Device Checklist

Requires **NEW_IOS_BUILD_REQUIRED** (native `HiddenAudioModule.swift` changes).

Build under test after next approved iOS build (not 1.0.190 without this fix).

Watch Metro / device logs for `[HTIosCallInterruption]` and `ios_call_interruption_*`.

## Required scenarios

- [ ] Incoming call while music plays
- [ ] Outgoing call while music plays
- [ ] Declined incoming call
- [ ] Answered call then hang up (foreground)
- [ ] Call ends while app backgrounded
- [ ] Caller hangs up before answer
- [ ] Second call shortly after first
- [ ] Radio playing → call
- [ ] Podcast playing → call
- [ ] Audiobook / lecture / motivational → call
- [ ] TV foreground → call
- [ ] TV background audio → call
- [ ] TV PiP → call
- [ ] CarPlay playback → call
- [ ] Bluetooth / headphones → call
- [ ] Navigate Home / Library / Search during call (no freeze)
- [ ] Manual pause during call → end call → must NOT auto-resume
- [ ] Tap different song during call → end call → must NOT resume old track
- [ ] Lock / unlock during call
- [ ] Siri or other interruption immediately after call

## Pass criteria

- No UI freeze / lag spike during call
- No excessive heat
- No duplicate audio
- No stale resume after manual pause or media change
- Metadata / PiP / CarPlay not regressed
- Lock Screen controls still work after call ends
