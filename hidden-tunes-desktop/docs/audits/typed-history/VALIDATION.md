# Typed History — Audit / Architecture / Validation

## Storage

- `ht-desktop:history:v1` (max 400)
- Migrates once from legacy family history keys
- Dual-writes from family `record*History` + Radio play

## Separation

History ≠ Library ≠ Downloads ≠ Playlists

## Continue listening

Incomplete finite media with position ≥ 15s. Radio/TV excluded.

## Validation

| Check | Result |
| ----- | ------ |
| TypeScript | Pass |
| Contract | see harness |
| Runtime | see runtime-results.json |
