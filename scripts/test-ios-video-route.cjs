const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const canonical = '11111111-1111-4111-8111-111111111111';
const freshId = 'AbCdEfGhIjK';
const staleId = 'ZyXwVuTsRqP';
let platform = true, mode = 'active', requests = [], navigations = [], failures = 0;
let issued = { enforced: true, revision: 2, delivery: 'embed', playbackUrl: `https://www.youtube.com/embed/${freshId}` };
class Unavailable extends Error {}
const policy = { get IOS_OPERATIONAL_PLATFORM() { return platform; }, IosOperationalUnavailableError: Unavailable,
  iosOperationalMatureAccess: async () => ({}),
  resolveIosOperationalPlayback: async (ref) => { requests.push(ref); if (mode === 'legacy') return { enforced: false }; if (!ref || mode === 'denied') throw new Unavailable(); return issued; },
};
const routeRouter = { push: value => navigations.push(value), replace: value => navigations.push(value) };
function load(file, dependencies) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText,
    { module: mod, exports: mod.exports, require: name => { if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`); return dependencies[name]; }, URL, Promise, Date, JSON, console, setTimeout: () => 1, clearTimeout() {} });
  return mod.exports;
}
const videoModule = load('services/videos/openVideoItem.ts', {
  'react-native': { Alert: { alert() {} }, Platform: { get OS() { return platform ? 'ios' : 'android'; } } },
  'expo-router': { router: routeRouter }, '../iosOperationalPolicy': policy,
  '../tvCatalogApi': { buildTvPlayerQueueItem: video => ({ id: video.source_id, videoId: video.source_id, videoSource: video.source_type }), fetchTvPlayback: async video => ({ id: video.id, source_type: 'youtube', source_id: staleId, stream_url: `https://www.youtube.com/embed/${staleId}` }) },
  '../tvDiscoveryOpen': { openTvDiscoveryStation: async () => ({ ok: true }) },
  './videoNormalizer': { getVideoDisplayCreator: item => item.creatorName || '', isVideoItemPlayableInCurrentRoute: () => true, normalizeVideoItem: video => ({ ...video, videoSource: video.source_type, externalVideoId: video.source_id, embedUrl: video.embed_url, playbackUrl: video.source_url }) },
  '../../utils/tvPlaybackFailureStore': { clearTvPlaybackFailure: async () => {}, getTvPlaybackFailureCount: async () => 0, recordTvPlaybackFailure: async () => { failures++; } },
  '../../utils/tvPlayabilityGate': { isBrowsePlayableTvVideo: () => true, isPlatformBlockedStreamUrl: () => false, isResolvedStreamPlayable: () => true, TV_LOCAL_QUARANTINE_THRESHOLD: 3, TV_NAV_STALE: 'stale' },
});
function screenHarness(isIos, authorize) {
  let cells = [], index = 0, effects = [], tree, dirty = true, owner = null, generation = 0, claims = 0, stopped = [], subscriber;
  const params = { id: canonical, videoId: staleId, videoSource: 'youtube', title: 'Synthetic TV', embedUrl: 'https://attacker.invalid/embed/x' };
  const react = {
    useState(initial) { const i = index++; if (!(i in cells)) cells[i] = typeof initial === 'function' ? initial() : initial; return [cells[i], value => { cells[i] = typeof value === 'function' ? value(cells[i]) : value; dirty = true; }]; },
    useRef(initial) { const i = index++; if (!(i in cells)) cells[i] = { current: initial }; return cells[i]; },
    useMemo(fn) { index++; return fn(); },
    useEffect(fn, deps) { const i = index++; const previous = cells[i]; if (!previous || deps.some((v, j) => v !== previous.deps[j])) { effects.push(() => { previous?.cleanup?.(); cells[i] = { deps, cleanup: fn() }; }); } },
  };
  const jsx = (type, props) => ({ type, props });
  const routePolicy = { IOS_OPERATIONAL_PLATFORM: isIos, getIosOperationalPolicySnapshot: () => ({ status: 'active', revision: 2 }), subscribeIosOperationalPolicy: fn => { subscriber = fn; return () => { subscriber = null; }; }, monitorIosOperationalPlayback: () => () => {} };
  const mod = load('app/youtube-player.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { DeviceEventEmitter: { emit() {} }, ScrollView: 'ScrollView', Text: 'Text', TouchableOpacity: 'TouchableOpacity', View: 'View', StyleSheet: { create: value => value } },
    '@react-native-async-storage/async-storage': { setItem: async () => {} }, '@expo/vector-icons': { Ionicons: 'Icon' }, 'expo-linear-gradient': { LinearGradient: 'Gradient' },
    'expo-router': { router: routeRouter, useLocalSearchParams: () => params }, 'react-native-webview': 'WebView', '../constants/theme': { COLORS: {}, GRADIENTS: { main: [] } },
    '../services/iosOperationalPolicy': routePolicy, '../services/videos/openVideoItem': { authorizeIosVideoEmbed: authorize },
    '../services/playback/PlaybackHandoffCoordinator': { claimExclusivePlayback: async () => { owner = 'video'; generation++; const captured = generation; claims++; return { isCurrent: () => generation === captured && owner === 'video' }; }, getActivePlaybackOwner: () => owner, getPlaybackHandoffGeneration: () => generation, registerPlaybackOwnerAdapter: () => () => {}, releasePlaybackOwner: value => { if (owner === value) owner = null; } },
    '../services/playback/videoSessionController': { registerVideoSessionController() {} }, '../utils/tvNavigation': { navigateTvPlayerBack() {} },
  });
  function walk(node, predicate) { if (!node || typeof node !== 'object') return null; if (predicate(node)) return node; for (const child of [node.props?.children].flat(Infinity)) { const found = walk(child, predicate); if (found) return found; } return null; }
  function render() { index = 0; effects = []; dirty = false; tree = mod.default(); const web = walk(tree, node => node.type === 'WebView'); if (web) web.props.ref.current = { injectJavaScript: script => stopped.push(script), stopLoading: () => stopped.push('stopLoading') }; for (const effect of effects) effect(); }
  async function settle() { for (let i = 0; i < 20; i++) { if (dirty) render(); await Promise.resolve(); } }
  return { settle, web: () => walk(tree, node => node.type === 'WebView'), button: name => walk(tree, node => node.type === 'TouchableOpacity' && node.props.onPress?.name === name), get claims() { return claims; }, stopped, revision: () => subscriber?.(), newerOwner: () => { generation++; owner = 'shared-audio'; }, get owner() { return owner; } };
}
async function main() {
  const api = videoModule;
  const authorized = await api.authorizeIosVideoEmbed(canonical);
  assert.equal(authorized.videoId, freshId); assert.equal(requests.at(-1).id, canonical);
  for (const playbackUrl of ['https://youtube.com.attacker.invalid/embed/AbCdEfGhIjK', 'https://attacker.invalid/watch?v=AbCdEfGhIjK', 'http://www.youtube.com/embed/AbCdEfGhIjK', 'https://www.youtube.com/embed/AbCdEfGhIjK/extra']) { issued = { ...issued, playbackUrl }; await assert.rejects(api.authorizeIosVideoEmbed(canonical)); }
  issued = { enforced: true, revision: 2, delivery: 'embed', playbackUrl: 'https://archive.org/embed/synthetic-archive' };
  assert.equal((await api.authorizeIosVideoEmbed(canonical)).videoSource, 'archive');
  await assert.rejects(api.authorizeIosVideoEmbed('archive-external-id'));
  issued = { enforced: true, revision: 2, delivery: 'embed', playbackUrl: `https://www.youtube.com/embed/${freshId}` };
  const raw = { id: canonical, title: 'Synthetic', source_type: 'youtube', source_id: staleId };
  assert.equal((await api.openVideoItem(raw)).ok, true); assert.equal(navigations.at(-1).params.videoId, freshId); assert.equal(navigations.at(-1).params.id, canonical); assert.equal(JSON.parse(navigations.at(-1).params.queue)[0].iosCanonicalId, canonical); assert.equal(raw.source_id, staleId);
  const before = navigations.length; mode = 'denied'; assert.equal((await api.openVideoItem(raw)).ok, false); assert.equal(navigations.length, before); assert.equal(failures, 0);
  mode = 'legacy'; assert.equal((await api.openVideoItem(raw)).ok, true); assert.equal(navigations.at(-1).params.videoId, staleId);
  platform = false; const count = requests.length; assert.equal((await api.openVideoItem(raw)).ok, true); assert.equal(requests.length, count); assert.equal(navigations.at(-1).params.videoId, staleId); platform = true;
  let resolve; let rejected = false; const pending = new Promise(done => { resolve = done; });
  const harness = screenHarness(true, async () => { if (rejected) throw new Unavailable(); return pending; });
  await harness.settle(); assert.equal(harness.web(), null); assert.equal(harness.claims, 0, 'No iframe or ownership before authorization');
  resolve({ enforced: true, revision: 2, videoId: freshId, videoSource: 'youtube', embedUrl: `https://www.youtube.com/embed/${freshId}` });
  await harness.settle(); assert(harness.web()); assert.match(harness.web().props.source.html, new RegExp(freshId)); assert.doesNotMatch(harness.web().props.source.html, new RegExp(staleId)); assert.equal(harness.claims, 1);
  assert.equal(harness.web().props.onShouldStartLoadWithRequest({ url: `https://www.youtube.com/embed/${freshId}` }), true);
  assert.equal(harness.web().props.onShouldStartLoadWithRequest({ url: `https://www.youtube.com/watch?v=${staleId}` }), false);
  assert.equal(harness.web().props.onShouldStartLoadWithRequest({ url: `https://attacker.invalid/?youtube.com/embed/${freshId}` }), false);
  rejected = true; harness.revision(); await harness.settle(); assert.equal(harness.web(), null); assert.equal(harness.owner, null); assert(harness.stopped.some(script => script.includes("frame.src='about:blank'")));
  let finish; const stalePending = new Promise(done => { finish = done; }); const stale = screenHarness(true, () => stalePending); await stale.settle(); stale.newerOwner(); finish({ enforced: false }); await stale.settle(); assert.equal(stale.claims, 0); assert.equal(stale.web(), null); assert.equal(stale.owner, 'shared-audio');
  const other = screenHarness(false, async () => { throw new Error('Non-iOS must not authorize'); }); await other.settle(); assert(other.web()); assert.equal(other.claims, 1); assert.match(other.web().props.source.html, new RegExp(staleId));
  console.log('PASS: canonical embed binding, malicious URL rejection, external Archive fail closed, legacy/non-iOS original route, no WebView/owner before authorization, owner-generation race, revision iframe revocation and navigation refusal. Offline React hook harness only; no native runtime claim.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
