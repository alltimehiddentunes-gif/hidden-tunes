# TV Lock Screen / Vehicle Controls — Real-device test script

Metro: `http://localhost:8081` from `C:\Users\Wills\Desktop\HiddenTunes-CLEAN-1.0.142`

Watch Metro for `[HTTVNowPlayingDiag]` and native `hidden_audio_presented_*` events.

## Binary requirement

Native changes in this fix (`activateAudioSession` on presented path, live duration omission, presented next/prev guards) require a **new iOS development build**. JS-only diagnostics and AppState republish work on a Dev Client that already exports `setPresentedNowPlaying` (production `1.0.189` / `f8cc5fe` has the API; latest Dev Client `1.0.188` / `38c36fab` does **not**).

## Test 1 — Lock Screen metadata

1. Start Metro from CLEAN workspace.
2. Open app on iPhone (rebuild-required Dev Client after this native change).
3. Play a verified TV station; wait until video+audio play.
4. Lock iPhone → open Lock Screen Now Playing.
5. Record title, broadcaster, artwork, playing state, controls.
6. Pause → confirm TV pauses. Play → confirm same TV resumes.
7. Unlock → confirm TV state synchronized.

Expect logs: `tv_playback_requested` → `tv_media_owner_claimed` → `tv_metadata_created` → `publish_now_playing_invoked` → `native_bridge_result` success → `tv_native_player_ready` → `app_entered_background` → republish.

## Test 2 — Station switching

Start TV from a multi-item list → lock → next → previous. Confirm stream swap + metadata swap; no music/radio.

## Test 3 — Media ownership

Music → TV → Radio/podcast. Confirm immediate stop, metadata replace, no stale TV commands.

## Test 4 — Background and PiP

TV → PiP → background → lock → play/pause → return. Confirm single player, synced metadata.

## Test 5 — Vehicle controls

Bluetooth/head-unit or CarPlay Now Playing (audio capability only — not CarPlay video). Pause/play/next/previous against TV owner.
