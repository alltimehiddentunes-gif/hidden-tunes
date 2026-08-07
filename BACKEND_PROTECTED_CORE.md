# Hidden Tunes Backend Protected Core

## PROTECTED — CATALOG UPLOAD

- Status: **PROTECTED CORE — PRODUCTION ROUTING VERIFIED**
- Owner: **Next.js `POST /api/admin/upload-track`**
- Source: `hidden-tunes-backend/hidden-tunes-admin/app/api/admin/upload-track/route.ts`
- Change authority: **EXPLICIT USER APPROVAL ONLY**

Required architecture:

```text
BulkUploadPanel
→ Next.js POST /api/admin/upload-track
→ requireUploadPermission(req)
→ existing R2 upload flow
→ existing Supabase artist/album/song persistence
→ optional lyrics handling
→ JSON response
```

Successful contract:

- HTTP 200
- `Content-Type: application/json`
- `success: true`
- `track.id` present

Failure contract:

- non-2xx HTTP status
- `Content-Type: application/json`
- `success: false`
- `error` present

Never intercept, replace, wrap, reroute, refactor, feature-flag, or add another owner for this endpoint. Never alter its authentication, uploader authorization, R2 ordering, Supabase artist/album/song persistence, lyrics semantics, or response contract during unrelated work. Express compatibility routing, Emotional Worlds, TV, Smart TV, Website features, enrichment, and catalog tooling must integrate beside this path and must not depend on or modify it.

Any task touching the owner, `BulkUploadPanel`, upload permission helper, R2 helper, Supabase helper, proxy ownership, or related upload tests must first prove that all protected upload contracts remain unchanged. If a contract fails, stop and report:

```text
PROTECTED CORE VIOLATION
```

Do not automatically repair or refactor the subsystem. Wait for explicit user authorization.

Permanent regression checks live in `hidden-tunes-backend/scripts/test-admin-upload-freeze.mjs` and run through `npm run validate:admin-upload` from `hidden-tunes-backend`.
