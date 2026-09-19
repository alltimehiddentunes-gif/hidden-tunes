# Desktop Web navigation bridge baseline

Date: 2026-08-08  
Previous Git baseline: `0b01836e44ff869d1520b494b8ccb04c5f73f727`  
Qualification: the working tree already contained unrelated user changes; this baseline identifies only the authorized bridge files and generated Web bundle.

## Product-inert change

The Desktop application now contains a navigation-only bridge that is installed exclusively when the Web package injects `window.__HT_WEB_NAVIGATION_BOOTSTRAP__.enabled === true` before application startup.

Electron/Desktop does not inject that flag. Runtime verification against the unguarded Desktop Vite build returned:

- `window.__HT_WEB_NAVIGATION_BOOTSTRAP__`: `undefined`
- `window.HiddenTunesNavigation`: `undefined`
- document title: `Hidden Tunes Desktop`

No Desktop navigation entry, UI component, playback API, queue API, catalog API, auth API, backend method, or mutation API was added to the bridge.

## Navigation contract

Supported operations:

- get the current internal route;
- request a validated existing internal route;
- initialize an existing internal route;
- subscribe to internal route changes.

Supported existing detail states: track, artist, album, podcast show, audiobook, motivational program, and lecture series. Unsupported targets return `false` and are not redirected to a different screen.

## Source identity

| File | SHA-256 |
| --- | --- |
| `src/App.tsx` | `5c154d638313deb65673a72a69119239f81fba3f192cf14c15692afafddc5842` |
| `src/lib/webNavigationBridge.ts` | `bf43d4ecf024df50cbe25fc36238793e06a77e6aec658c81fcd08eb3bce002ce` |

Generated Web candidate identity:

| Artifact | SHA-256 |
| --- | --- |
| Web `dist/index.html` | `f06be252d374074515cb5f57204b1943673e7967798f55f5e3d95cdfe0ab4773` |
| Referenced bundle `dist/assets/index-B3hJosDk.js` | `2e1753d177cd5163af20a28edb6ebedf9a49d79850dc8538a121fcf91fd76c74` |
| Web routing adapter source | `ca430d22c3883aad7d419735a5b571b0ac6c1fc33dd41c1fe0d06d5676739b76` |

## Regression evidence

- TypeScript + Vite Desktop production build: PASS
- Route-independent media persistence: PASS
- Playback mutex: PASS
- Cross-platform contract: PASS
- Search routing contract: PASS (21/21)
- Desktop bridge guard runtime: PASS
- Desktop visual/UI source change: NONE
- Playback architecture change: NONE
- Queue architecture change: NONE
- Audio owner: 1
- Video owner: 1
- Queue owner: 1

This baseline supersedes claims of byte-identical parity with the old Git SHA only for the explicitly authorized Web-inert navigation bridge.
