const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const path = require('node:path');
const ids = [1,2,3,4,5].map(n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`);
let revision = 1, status = 'active', music = true, djcity = true, requests = [], changed = false, fail = false, mature = false, flipAfterSnapshots = 0;
const matureId = '00000000-0000-4000-8000-000000000006';
const accesses = [];
let known = new Set();
const policy = {
  IOS_OPERATIONAL_PLATFORM: true,
  refreshIosOperationalPolicy: async () => ({ status, revision }),
  getIosOperationalPolicySnapshot: () => { const value = { status, revision }; if (flipAfterSnapshots && --flipAfterSnapshots === 0) { revision++; known.clear(); } return value; },
  isIosOperationalItemVisible: ref => known.has(ref.id),
  filterIosOperationalItems: async (items, _mapper, access) => { accesses.push(access); items.forEach(row => known.add(row.id)); return items; },
};
const source = fs.readFileSync(path.join(__dirname,'../services/iosMusicCatalog.ts'),'utf8');
const moduleValue = { exports: {} };
const context = { module: moduleValue, exports: moduleValue.exports, require: name => { if (name === '../utils/matureContentSettings') return { shouldIncludeMatureInApi: () => mature }; assert.equal(name,'./iosOperationalPolicy'); return policy; }, URLSearchParams, AbortController, setTimeout, clearTimeout, console,
 fetch: async (url) => {
   requests.push(url);
   if (fail) return { ok:false, status:503 };
   if (changed) { changed=false; revision++; known.clear(); return { ok:false, status:409 }; }
   const params = new URL(url).searchParams;
   const rows = music ? ids.filter((_,i)=>djcity || i<2).map(id=>({ id, title:`track ${id}`, artist_name:'Artist' })) : [];
   if (music && params.get('mature_enabled') === 'true' && params.get('age_confirmed') === 'true') rows.push({ id: matureId, title: 'Mature fixture', is_mature: true });
   const limit = Number(params.get('limit')), offset = Number(params.get('cursor') || '0');
   return { ok:true, status:200, json:async()=>({ success:true, enforcementEnabled:true, revision, total:rows.length, items:rows.slice(offset, offset+limit), nextCursor:offset+limit<rows.length?String(offset+limit):null }) };
 },
};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
const api = moduleValue.exports;
async function main() {
  const a = await api.getIosMusicPage({limit:2});
  assert.equal(a.total,5); assert.equal(a.items.length,2); assert.equal(a.hasMore,true);
  const b = await api.getIosMusicPage({page:2,limit:2});
  assert.equal(b.items[0].id,ids[2]);
  assert.match(requests.at(-1),/cursor=2/);
  const all = await api.getAllIosMusic();
  assert.equal(all.length,5);
  assert.equal(api.iosMusicSnapshot().length,5);
  mature=true;
  assert.equal(api.iosMusicSnapshot().length,0,'changing consent hides the previous access-context snapshot immediately');
  assert.equal((await api.getAllIosMusic()).length,6,'consented mature browse uses the existing mature gate');
  assert.equal(accesses.at(-1).matureEnabled,true,'canonical resolve receives the same mature access');
  assert.match(requests.at(-1),/mature_enabled=true/);
  assert.match(requests.at(-1),/age_confirmed=true/);
  mature=false;
  assert.equal(api.iosMusicSnapshot().length,0,'revoking consent cannot expose a previously admitted mature snapshot');
  assert.equal((await api.getAllIosMusic()).length,5,'complete caches are isolated by mature access');
  flipAfterSnapshots=2;
  await assert.rejects(api.getAllIosMusic({forceRefresh:true}),/changed during catalog load/,'a policy change after the page check cannot publish a stale complete catalog');
  assert.equal(api.iosMusicSnapshot().length,0);
  revision++; djcity=false; known.clear();
  assert.equal(api.iosMusicSnapshot().length,0,'stale cache disappears before the new request');
  const mureka = await api.getAllIosMusic(); assert.equal(mureka.length,2);
  const beyond = await api.getIosMusicPage({page:3,limit:2}); assert.equal(beyond.items.length,0); assert.equal(beyond.hasMore,false);
  revision++; music=false; known.clear();
  assert.equal((await api.getIosMusicPage()).items.length,0,'disabled section cannot fall back to legacy rows');
  music=true; changed=true;
  assert.equal((await api.getIosMusicPage()).items.length,2,'409 retries a complete page against refreshed revision');
  fail=true;
  await assert.rejects(api.getIosMusicPage(),/unavailable/,'transport error cannot use the old cache');
  fail=false; status='unavailable';
  await assert.rejects(api.getAllIosMusic(),/unavailable/);
  status='legacy'; const before=requests.length;
  assert.equal(await api.getIosMusicPage(),null); assert.equal(await api.getAllIosMusic(),null); assert.equal(requests.length,before);
  assert.equal(api.iosMusicSnapshot(),null);
  policy.IOS_OPERATIONAL_PLATFORM=false; status='active';
  assert.equal(await api.getIosMusicPage(),null); assert.equal(requests.length,before);
  console.log('PASS: iOS music pagination/cursor, complete counts, revision cache invalidation, source/master off, 409 retry, offline denial, legacy/non-iOS zero requests. Offline fixtures only.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
