# Phase 13 Offline / Session UX

| Surface | Mechanism | Behaviour |
|---------|-----------|-----------|
| Offline banner | `DesktopOfflineBanner` + `useDesktopConnectivity` | Advisory chrome; Open Downloads CTA; does not remount playback |
| Session expired | `DesktopAuthProvider.sessionNotice` + `DesktopSessionStatusBanner` | Unexpected signed-in → signed-out; intentional sign-out suppressed |
| Catalog stale | Existing `CatalogStaleBanner` | Backend/catalog refresh failures unchanged |
| Backend unavailable | Catalog / API error paths already present | Not rewritten; Settings Diagnostics surfaces status |

Does not implement offline download completion (Phase 14) or auto-update (Phase 19).
