# Hidden Tunes Desktop Protected Core

## PROTECTED — CATALOG UPLOAD

- Owner: **Next.js `POST /api/admin/upload-track`**
- Source: `hidden-tunes-backend/hidden-tunes-admin/app/api/admin/upload-track/route.ts`
- Change authority: **EXPLICIT USER APPROVAL ONLY**

The desktop application and every future Desktop, Website, Smart TV, TV, Emotional Worlds, search, playlist, favorites, or catalog feature must treat this backend upload route as an external protected boundary:

```text
BulkUploadPanel
→ Next.js POST /api/admin/upload-track
→ requireUploadPermission(req)
→ existing R2 flow
→ existing Supabase artist/album/song persistence
→ JSON { success: true, track: { id } }
```

Desktop work must never intercept, proxy, wrap, replace, feature-flag, reinterpret, or add dependencies to this path. It must never change the request URL, authentication header, response expectations, persistence ordering, or failure semantics.

If desktop work would affect this contract, stop and report:

```text
PROTECTED CORE VIOLATION
```

Wait for explicit user approval before making any change.
