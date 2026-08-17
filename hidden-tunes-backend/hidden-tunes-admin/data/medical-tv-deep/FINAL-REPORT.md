# Medical TV catalogue report — 2026-08-17

## Outcome

- Discovery index candidates reviewed: 41
- Focused candidates classified and tested: 13
- New rows inserted: 0
- Existing canonical identities found: 10
- Existing playable medical rows normalized: 6
- Production play checks passed after normalization: 6/6
- Search checks passed: 6/6
- `Medical & Health` category checks passed: 6/6

## Playable medical channels normalized

| Channel | Country | Language | Subcategory | Record ID |
| --- | --- | --- | --- | --- |
| Code Health TV | Bulgaria | Bulgarian | Public Health | `548625af-200a-4aa2-b3c3-d8c4ce7ff11a` |
| Persiana Medical | France | Persian | Medical Education | `74e2384f-43dd-4a53-8b3a-fe3914ab8b6a` |
| Better Health TV | United States | English | Fitness & Clinical Wellness | `9cbba769-295c-4126-8990-697fdf9c5137` |
| CVR Health | India | Telugu | Medical Education | `550cdf1b-80a8-4fa1-8f0e-a668e2f2df79` |
| Doctor | Russia | Russian | Surgery & Diagnosis | `1844bef9-8e9b-4d03-be2c-8ae7cc954ee9` |
| Dr G Medical Examiner | United States FAST feed listed for Poland | English | Medical Documentaries | `bacc6b74-3211-4cf2-9636-9f940f13d4ec` |

No stream, identity, status, health, activation, reliability or playback fields were changed. Only language, category, subcategory/genre, description, tags and available logo metadata were normalized.

## Other classifications

- `DUPLICATE_EXISTING`: 10 total. Three medical-series identities are existing blocked rows and were not reactivated: Detetives Medicos, Logos TV Salud and Pluto TV Misterios Medicos. UCTV is an existing playable general university channel and was not misclassified as primarily medical.
- `NO_DIRECT_PLAYABLE_STREAM`: CCTV Health (HTTP-only unofficial endpoint).
- `DRM_OR_AUTH_PROTECTED`: Doctor TV Network (signed session URL only).
- `GEO_RESTRICTED`: The Health Channel / South Florida PBS.
- Retest queue: Logos TV Salud remains an existing blocked record; its discovered manifest returned 404. It was preserved unchanged.

## Evidence and rollback

- `candidate-manifest.json`: candidate provenance, rights assessment and pre-write eligibility.
- `verification-result.json`: production catalogue state and `/api/tv/videos/{id}/play` results.
- `metadata-patch-plan.json`: exact before/after values and rollback source.
- `metadata-patch-result.json`: six successful production metadata updates.
- Rollback restores the exact `before` metadata fields for the six IDs in `metadata-patch-plan.json`; it does not delete records or alter playback.

## Safety

No Mobile or Desktop UI, player, navigation, authentication, queue, radio, TV playback, PiP, schema, RLS, migration, deployment or release files were modified. Unrelated dirty-tree work was not staged or absorbed.
