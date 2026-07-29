# MOTIVATIONALS Audit (Desktop)

**Owners:** `MotivationalsPage.tsx`, `MotivationalProgramPage.tsx`  
**Status:** Partially complete · **62%** · structurally incomplete  
**Release ready:** No (video path)

## Coverage

| Area | Result |
|------|--------|
| Browse / search / media filters | Audio/video badges |
| Detail / playback (audio) | Resolve-on-play works |
| Video sessions | **Risk:** no `mountTvVideo` on program page — video may park invisible (same class of defect as Sports) |
| Queue / progress | Capability gated |
| Downloads | Bridge gated |

## Verdict

Audio path mostly usable. Video motivational playback is **not visually trustworthy** until surface mounting matches Lectures/TV.
