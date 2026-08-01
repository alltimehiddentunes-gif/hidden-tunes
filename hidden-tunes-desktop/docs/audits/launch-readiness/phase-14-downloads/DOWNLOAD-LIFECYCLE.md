# Download Lifecycle

queued → resolving → downloading (throttled progress) → completed (checksum + size check) | failed | cancelled
Pause API cancels and labels `no_resume`; UI exposes Cancel/Retry (restart).
Duplicates blocked for active or completed identity `type:id`.
