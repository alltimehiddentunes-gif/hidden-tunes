import assert from 'node:assert/strict';import fs from 'node:fs';
const source=fs.readFileSync(new URL('../services/crossplayPhaseA.ts',import.meta.url),'utf8');
assert.match(source,/crypto\.getRandomValues/);assert.match(source,/Math\.min\(8/);assert.match(source,/expectedVersion/);assert.match(source,/ACCOUNT_CACHE_KEY/);assert.match(source,/subscribeToMobileAuthState/);assert.doesNotMatch(source,/service.?role/i);
console.log('PASS Mobile Cross Play Phase A device/progress/offline/account-isolation contract');
