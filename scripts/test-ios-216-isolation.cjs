const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const target = { platform: 'ios', nativeBuild: '1.0.216', bundleId: 'com.hiddentunes.app', profile: 'IOS_216' };
const mureka = '00000000-0000-4000-8000-000000000001';
const djcity = '00000000-0000-4000-8000-000000000002';
const signedMedia = `https://admin.hiddentunes.com/api/ios/media/music/${mureka}?ticket=opaque.signed-v2`;

function fixture(platform, build, bundle = 'com.hiddentunes.app', options = {}) {
  let now = 100000, revision = 1, active = true, djcityEnabled = false, offline = false;
  let responseTarget = target;
  const calls = [], reads = [], writes = [], intervals = new Map(), appStateListeners = new Set();
  let nextTimer = 0, nativeReads = 0;
  const native = options.native === undefined ? { platform: { ios: { buildNumber: build } }, manifest: { ios: { bundleIdentifier: bundle, buildNumber: '1.0.216' } }, executionEnvironment: 'bare' } : options.native;
  const cache = new Map();
  const response = body => ({ ok: true, status: 200, json: async () => body });
  const contextValues = {
    console, URL, URLSearchParams, Headers, AbortController,
    Date: class extends Date { static now() { return now; } },
    setTimeout: () => ++nextTimer, clearTimeout: () => {},
    setInterval: (callback, delay) => { const id = ++nextTimer; intervals.set(id, { callback, delay }); return id; },
    clearInterval: id => intervals.delete(id),
    fetch: async (url, init = {}) => {
      calls.push({ url, init });
      if (offline) throw new Error('offline');
      const parsed = new URL(url);
      if (parsed.pathname === '/api/ios/policy') return response({ version: 1, policyTarget: responseTarget, revision, enforcementEnabled: active, profileActive: active, mode: active ? 'active' : 'legacy', controls: [
        { id: 'ios', parentId: null, enabled: true }, { id: 'section:music', parentId: 'ios', enabled: true },
        { id: 'source:music:mureka', parentId: 'section:music', enabled: true }, { id: 'source:music:djcity', parentId: 'section:music', enabled: djcityEnabled },
      ] });
      if (parsed.pathname === '/api/ios/resolve') return response({ success: true, policyTarget: responseTarget, enforcementEnabled: active, revision, items: JSON.parse(init.body).items.map(item => ({ ...item, allowed: item.id !== djcity || djcityEnabled })) });
      const [type, id] = parsed.pathname.split('/').slice(-2);
      if (id === djcity && !djcityEnabled) return { ok: false, status: 403, json: async () => ({}) };
      return response({ success: true, allowed: true, policyTarget: responseTarget, enforcementEnabled: active, revision, type, id, playbackUrl: signedMedia, delivery: 'controlled_media' });
    },
  };
  function load(relative) {
    const full = path.resolve(root, relative);
    if (cache.has(full)) return cache.get(full).exports;
    const mod = { exports: {} }; cache.set(full, mod);
    const requireLocal = name => {
      if (name === 'react-native') return { Platform: { OS: platform }, AppState: { addEventListener: (_name, callback) => { appStateListeners.add(callback); return { remove: () => appStateListeners.delete(callback) }; } } };
      if (name === 'expo-modules-core') return { requireOptionalNativeModule: module => { assert.equal(module, 'ExponentConstants'); nativeReads++; return native; } };
      if (name === 'expo-constants') throw new Error('OTA-sensitive Constants facade must not select installed identity');
      if (name === '@react-native-async-storage/async-storage') return { getItem: async key => { reads.push(key); return options.saved ?? null; }, setItem: async (key, value) => { writes.push({ key, value }); } };
      if (name.endsWith('/matureContentSettings')) return { shouldIncludeMatureInApi: () => false };
      if (name.endsWith('/maturePodcastSettings')) return { shouldIncludeMaturePodcasts: () => false };
      assert.ok(name.startsWith('.'), `unexpected dependency ${name}`);
      return load(path.relative(root, path.resolve(path.dirname(full), `${name}.ts`)));
    };
    const source = fs.readFileSync(full, 'utf8');
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { ...contextValues, module: mod, exports: mod.exports, require: requireLocal }, { filename: full });
    return mod.exports;
  }
  const api = load('services/iosOperationalPolicy.ts');
  return { api, load, calls, reads, writes, intervals, appStateListeners, nativeReads: () => nativeReads,
    advance(ms) { now += ms; }, setDjcity(value) { djcityEnabled = value; revision++; }, setActive(value) { active = value; revision++; }, setOffline(value) { offline = value; }, setTarget(value) { responseTarget = value; } };
}

async function drainUntil(predicate) {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await Promise.resolve(); }
  assert.ok(predicate(), 'pending local promises completed');
}

async function assertLegacy(f, label) {
  const song = { id: djcity, url: 'https://existing.invalid/djcity.mp3' }, songs = [song];
  assert.equal(f.api.IOS_OPERATIONAL_PLATFORM, false, label);
  assert.equal(f.api.IOS_OPERATIONAL_IDENTITY.profile, 'IOS_LEGACY', label);
  assert.equal(f.api.getIosOperationalPolicySnapshot().status, 'legacy');
  assert.equal((await f.api.refreshIosOperationalPolicy(true)).status, 'legacy');
  assert.equal(await f.api.filterIosOperationalItems(songs, item => ({ type: 'music', id: item.id })), songs);
  assert.equal(await f.api.authorizeIosOperationalSong(song), song);
  await f.api.assertIosOperationalContentAllowed({ type: 'music', id: djcity });
  const music = f.load('services/iosMusicCatalog.ts');
  assert.equal(await music.getIosMusicPage(), null);
  assert.equal(await music.getAllIosMusic(), null);
  assert.equal(music.iosMusicSnapshot(), null);
  assert.equal((await f.api.resolveIosOperationalPlayback(null)).enforced, false);
  assert.equal(f.api.isIosOperationalItemVisible({ type: 'music', id: djcity }), true);
  assert.equal(f.api.iosOperationalSectionEnabled('music'), true);
  assert.equal(Object.keys(f.api.iosOperationalRequestHeaders()).length, 0);
  let checked = false;
  const stop = f.api.monitorIosOperationalPlayback(() => { checked = true; });
  f.api.requestIosOperationalItemVisibility({ type: 'music', id: djcity });
  await Promise.resolve(); stop();
  assert.equal(checked, false); assert.equal(f.intervals.size, 0); assert.equal(f.appStateListeners.size, 0);
  assert.equal(f.calls.length, 0, `${label}: zero new network work`);
  assert.equal(f.reads.length, 0, `${label}: saved216 marker is never consulted`);
  assert.equal(f.writes.length, 0);
  const sports = f.load('services/iosSportsPolicy.ts');
  const legacyUrl = 'https://admin.hiddentunes.com/api/sports/fixtures/existing/play';
  const legacyInit = { method: 'POST', body: '{"country":"DE"}' };
  await sports.fetchIosSportsPlayback(legacyUrl, legacyInit);
  assert.equal(f.calls.length, 1, 'only the existing ordinary Sports request occurs');
  assert.equal(f.calls[0].url, legacyUrl);
  assert.equal(f.calls[0].init, legacyInit, 'legacy Sports init remains the exact original object');
}

async function main() {
  const saved = JSON.stringify({ version: 1, policyTarget: target, activated: true, revision: 999 });
  for (const build of [null, undefined, '', '1.0.1', '1.0.213', '1.0.214', '1.0.215', '1.0.217', '2.0.0', '216', '1.0.216.0', '1.0.0216', '1.0.216-beta']) await assertLegacy(fixture('ios', build, 'com.hiddentunes.app', { saved }), `installed ${build}`);
  for (const platform of ['android', 'web', 'windows', 'macos', 'linux', 'amazon-fire']) {
    const f = fixture(platform, '1.0.216', 'com.hiddentunes.app', { saved }); await assertLegacy(f, platform); assert.equal(f.nativeReads(), 0);
  }
  for (const bundle of ['com.other.app', 'com.hiddentunes.app.dev', '', null]) await assertLegacy(fixture('ios', '1.0.216', bundle), `bundle ${bundle}`);
  await assertLegacy(fixture('ios', '1.0.216', undefined, { native: null }), 'missing native module');
  await assertLegacy(fixture('ios', '1.0.216', undefined, { native: { platform: { ios: { buildNumber: '1.0.216' } }, manifest: '{bad' } }), 'malformed embedded config');
  await assertLegacy(fixture('ios', '1.0.216', undefined, { native: { platform: { ios: { buildNumber: '1.0.216' } }, manifest: { ios: { bundleIdentifier: 'com.hiddentunes.app' } }, executionEnvironment: 'storeClient' } }), 'Expo Go');
  await assertLegacy(fixture('ios', '1.0.215', undefined, { native: { platform: { ios: { buildNumber: '1.0.215' } }, manifest: { ios: { bundleIdentifier: 'com.hiddentunes.app', buildNumber: '1.0.216' } }, expoConfig: { ios: { buildNumber: '1.0.216', bundleIdentifier: 'com.hiddentunes.app' } } } }), 'OTA216 cannot change installed215');

  const f = fixture('ios', '1.0.216');
  const { IosOperationalPolicyClient } = f.load('services/iosOperationalPolicyCore.ts');
  const unspecified = new IosOperationalPolicyClient({ platform: 'ios', now: Date.now, read: async () => { throw new Error('unexpected storage'); }, write: async () => { throw new Error('unexpected storage'); }, request: async () => { throw new Error('unexpected request'); } });
  assert.equal((await unspecified.refresh(true)).status, 'legacy', 'core requires explicit216 identity even when platform is ios');
  assert.equal(f.api.IOS_OPERATIONAL_PLATFORM, true);
  assert.equal(f.api.getIosOperationalPolicySnapshot().status, 'loading');
  assert.equal(f.api.isIosOperationalItemVisible({ type: 'music', id: djcity }), false);
  await f.api.refreshIosOperationalPolicy();
  const songs = [{ id: mureka }, { id: djcity }];
  assert.deepEqual(JSON.parse(JSON.stringify(await f.api.filterIosOperationalItems(songs, item => ({ type: 'music', id: item.id })))), [{ id: mureka }]);
  await assert.rejects(f.api.resolveIosOperationalPlayback({ type: 'music', id: djcity }));
  assert.equal((await f.api.resolveIosOperationalPlayback({ type: 'music', id: mureka })).playbackUrl, signedMedia, 'signed native media URL remains opaque and unchanged');
  assert.ok(f.writes.every(item => item.key === '@hidden_tunes_ios_operational_policy_IOS_216_v1'));
  assert.deepEqual(JSON.parse(f.writes.at(-1).value).policyTarget, target);

  f.setDjcity(true); f.advance(15001); await f.api.refreshIosOperationalPolicy();
  assert.equal((await f.api.filterIosOperationalItems(songs, item => ({ type: 'music', id: item.id }))).length, 2);
  let ownerChecks = 0;
  const stop = f.api.monitorIosOperationalPlayback(async () => { ownerChecks++; await f.api.assertIosOperationalContentAllowed({ type: 'music', id: mureka }); });
  await drainUntil(() => ownerChecks === 1);
  await drainUntil(() => f.calls.at(-1)?.url.includes('/api/ios/resolve'));
  await new Promise(resolve => setImmediate(resolve)); // Finish the monitor's initial async check before advancing its fake clock.
  const timer = [...f.intervals.values()][0]; assert.ok(timer.delay <= 60000); assert.equal(timer.delay, 15000);
  f.setDjcity(false); f.advance(timer.delay); timer.callback();
  await drainUntil(() => f.api.getIosOperationalPolicySnapshot().revision === 3);
  assert.equal(f.api.isIosOperationalItemVisible({ type: 'music', id: djcity }), false, 'source revision invalidates cached DJcity within the scheduled15s check');
  await assert.rejects(f.api.resolveIosOperationalPlayback({ type: 'music', id: djcity }));
  stop(); assert.equal(f.intervals.size, 0); assert.equal(f.appStateListeners.size, 0);
  for (const call of f.calls) for (const [key, value] of Object.entries(f.api.iosOperationalRequestHeaders())) assert.equal(new Headers(call.init.headers).get(key), value, `${call.url}: exact wire tuple`);

  const freshOffline = fixture('ios', '1.0.216'); freshOffline.setOffline(true);
  assert.equal((await freshOffline.api.refreshIosOperationalPolicy()).status, 'unavailable', 'new216 cannot assume legacy on offline cold start');
  for (const wrongTarget of [null, { ...target, profile: 'IOS_LEGACY' }, { ...target, nativeBuild: '1.0.215' }, { ...target, nativeBuild: '1.0.217' }, { ...target, bundleId: 'com.other.app' }]) {
    const wrong = fixture('ios', '1.0.216'); wrong.setTarget(wrongTarget);
    assert.equal((await wrong.api.refreshIosOperationalPolicy()).status, 'unavailable', 'mismatched target never authorizes216');
  }
  for (const operation of ['resolve', 'playback']) {
    const wrong = fixture('ios', '1.0.216'); await wrong.api.refreshIosOperationalPolicy();
    wrong.setTarget({ ...target, nativeBuild: '1.0.215' });
    if (operation === 'resolve') assert.equal((await wrong.api.filterIosOperationalItems([{ id: mureka }], item => ({ type: 'music', id: item.id }))).length, 0);
    else await assert.rejects(wrong.api.resolveIosOperationalPlayback({ type: 'music', id: mureka }));
  }
  const inactive = fixture('ios', '1.0.216'); inactive.setActive(false);
  assert.equal((await inactive.api.refreshIosOperationalPolicy()).status, 'legacy', 'only valid explicit inactive216 response may select legacy');
  console.log('PASS installed216 isolation: <=215/future/non-iOS zero policy work, OTA spoof resistance, exact native tuple, target mismatch/offline denial, signed URL preservation,15s propagation and DJcity play denial. Local fixtures only.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
