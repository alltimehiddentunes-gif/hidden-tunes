# Performance

- Persistent player uses existing provider hooks; progress via `useDesktopPlaybackProgress` (not full App metadata churn beyond existing bar).
- Queue panel mounts only when Queue is open in the rail.
- Home rails remain bounded; no unbounded catalogue loads added.
- No new timers / keyboard listeners / playback engines.
- Artwork glow uses existing CSS; no continuous JS blur animation added.
- Avoided remounting playback on family change — rail is a view over one provider.
