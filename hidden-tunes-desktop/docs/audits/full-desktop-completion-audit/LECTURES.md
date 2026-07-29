# LECTURES Audit (Desktop)

**Owners:** `LecturesPage.tsx`, `LectureSeriesPage.tsx`  
**Status:** Mostly complete · **70%**  
**Release ready:** Conditional

## Coverage

| Area | Result |
|------|--------|
| Browse / search / media filter | Present |
| Detail | Series page mounts shared video via `mountTvVideo` (**better than Sports/Motivationals**) |
| Playback / progress / Queue | Session play + progressive video tags |
| UX | Card click often plays (aggressive vs open-details) |
| Leave detail | Video unmounts to parking (expected ownership) |

## Gaps

- Visual polish
- Downloads bridge gated
- `lecture-item` activeView type may lack dedicated router branch
