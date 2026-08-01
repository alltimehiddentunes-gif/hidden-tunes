# Launch roadmap (dependency-ordered)

## Must complete before launch

1. **Green production typecheck + `npm run build`**  
   Fix the 72 `tsc -b` errors (or align the build gate with a real typecheck that matches CI). Without this, `npm run dist` is blocked.

2. **Sports / non-TV video surface decision**  
   Either:  
   - (A) Extend `resolveActivePlayerSurface` + rail + now-playing UI so sports (and motivational video) mount the shared `TvVideoSurface`, **and** handle or reject DASH honestly; **or**  
   - (B) Disable/hide Sports watch (and video motivational claims) for v1 and keep fixture browse only.  
   Do not ship Sports as “watchable” in the current state.

3. **Electron shell hardening**  
   CSP + `will-navigate` / `setWindowOpenHandler` URL allowlists; prefer adding `requestSingleInstanceLock`.

4. **Product honesty pass**  
   - Replace fake Home Recently Added presentation with real catalog metadata.  
   - Align Premium feature list with Downloads / cinematic player reality.  
   - Fix Home sidebar remaps or rename labels to match destinations.

5. **Versioning + Windows signing + clean-machine installer QA**  
   Bump off `0.0.1`, enable signing, run NSIS install on a clean Windows machine against production endpoints.

## Should complete before launch

6. Music Discover visual redesign to approach Home premium quality.  
7. Genre destination UX: dedicated page or remove Search display cap so pagination is truthful.  
8. ESLint error remediation (33 errors).  
9. Radio load-more.  
10. Library sports favourites (or remove sports from library schema UX).  
11. Lectures in global search.

## Post-launch improvements

12. Code-split the ~1.4 MB renderer chunk.  
13. Single-instance polish, deeper a11y focus restoration.  
14. Background/minimize playback explicit policy.  
15. macOS/Linux targets (currently Windows NSIS only).  
16. Cloud sync for Liked Songs.
