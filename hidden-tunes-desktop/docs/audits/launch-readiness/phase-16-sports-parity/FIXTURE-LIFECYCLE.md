# Fixture lifecycle

Canonical states: scheduled, live, paused, finished, postponed, cancelled, suspended, abandoned, unknown. Live requires explicit backend evidence, never clock inference. Filter changes abort prior work, increment generation and reset page one. Stale results cannot append. Refresh failure keeps proven prior fixtures; empty initial failure renders error/Retry.
