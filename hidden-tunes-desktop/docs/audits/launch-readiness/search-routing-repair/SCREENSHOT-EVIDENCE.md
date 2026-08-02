# Screenshot evidence

Captured from `release/win-unpacked/resources/app.asar/dist/index.html` through the packaged Electron renderer:

- `screenshots/search-bbc-1024x768.png`
- `screenshots/search-bbc-1440x900.png`
- `screenshots/search-bbc-1920x1080.png`
- `screenshots/runtime-state.json`

The first diagnostic exposed an oversized absolute artwork frame. After adding positioned Search artwork wrappers, the final captures show bounded 44×44 artwork, organised groups, independent Play controls, and keyboard-focusable buttons. Packaged automation also proves TV card → `tv` and TV Play → route remains `search`.
