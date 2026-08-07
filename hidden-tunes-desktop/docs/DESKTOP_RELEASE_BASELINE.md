# Hidden Tunes Desktop 1.0.0 release baseline

- Release branch: `desktop/integrate-home-music-split`
- Release commit: the commit containing this baseline, titled `release(desktop): freeze Hidden Tunes Desktop 1.0.0`
- Source parent: `14e96b275943cbcf8f44b5020455db46fde24c8d`
- Artifact: `Hidden-Tunes-Desktop-1.0.0-win-x64.exe`
- Platform: Windows x64, NSIS
- Version and product metadata: `1.0.0`, `Hidden Tunes Desktop`

The candidate was rebuilt from an isolated checkout containing only the release manifest. TypeScript/Vite build, full ESLint, Electron syntax, non-Sports contracts, NSIS packaging, installed packaged navigation, and clean exit all passed. Functional identity—not byte identity—is the reproducibility requirement because packaging metadata and timestamps can vary.

Release SHA is the remote SHA of the named release commit and is reported by the freeze procedure after push; a Git commit cannot embed its own object ID.
