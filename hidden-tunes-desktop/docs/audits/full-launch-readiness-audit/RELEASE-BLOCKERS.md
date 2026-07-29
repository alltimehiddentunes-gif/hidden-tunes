# RELEASE BLOCKERS

## Critical

1. Dirty/staged production modules + home-reference assets required by live app (not on HEAD)
2. Sports (and Motivational video) can play without visible surface — unsafe to market as watchable
3. No public account/legal/support completeness for real users
4. Unsigned `0.0.1` packaging with no clean-machine installer proof

## High

5. Music visually requires redesign for primary destination bar
6. Favorites IA = music-only Liked
7. Settings dead controls / Premium placeholder / no Profile
8. Music Downloads stub contradicts real Downloads
9. Electron missing CSP, single-instance, navigation guards
10. Dual runtime-config copies both dirty — must commit intentionally
10b. Full ESLint failing (33 errors) — must clear or explicitly waive with policy before release

## Medium

11. Performance unproven (monolith, visualizer, search fan-out)
12. Decorative LIVE badges
13. Home Worlds chip query unused
14. Downloads resume weakness
15. Accessibility parity gaps

## Low

16. Stock README / informal test wiring
17. macOS/Linux absent (OK if Windows-first)

**Exact list above is evidence-based from SSD dirty tree + code + verifiers + Electron launch this audit.**
