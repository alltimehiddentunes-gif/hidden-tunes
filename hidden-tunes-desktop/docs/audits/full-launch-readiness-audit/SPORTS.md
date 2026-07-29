# SPORTS Audit

**Classification:** **fixture-only / unsafe to market as watchable** · ~45%

| Layer | Truth |
|-------|--------|
| Feature flag | API `enabled` → truthful unavailable UI |
| Fixtures | Live/upcoming/completed browse real |
| Fake watch | No — Play only if `isPlayable` |
| Streams | Resolve path exists when playable |
| Video surface | **Broken** — sports uses video service but right rail stays audio; no `mountTvVideo`; picture can park 1×1 clipped |
| Library favs | Unsupported |
| Notifications | Not a complete product |

**What remains for launch decision**

1. Mount visible Sports video surface (or force audio-only messaging)
2. Or disable Sports watch UI for first launch and keep fixtures-only
3. Commit dirty surface/resolver modules with intentional Sports policy

**Do not enable as streaming sports for public launch without surface fix.**
