# Test Matrix

| Check | Script |
|-------|--------|
| Contract | `npm run verify:downloads` |
| Phase 14 static | `npm run verify:phase14-downloads` |
| Runtime Electron | `node scripts/validate-downloads-runtime.mjs` (manual/CI optional) |
| Permanent gates | security, mutex, route-media, phase 9–13 |
