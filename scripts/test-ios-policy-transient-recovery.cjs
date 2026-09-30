/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const target = { platform: 'ios', nativeBuild: '1.0.216', bundleId: 'com.hiddentunes.app', profile: 'IOS_216' };

function fixture() {
  let route = '/radio';
  let fault = null;
  let storageFails = false;
  let requests = 0;
  let policy = {
    version: 1, revision: 1, enforcementEnabled: false, profileActive: false,
    mode: 'legacy', policyTarget: target, controls: [],
  };
  const navigation = [];
  const timers = new Map();
  let nextTimer = 0;
  const modules = new Map();
  let service;

  const mocks = {
    'react-native': {
      Platform: { OS: 'ios' }, AppState: { addEventListener: () => ({ remove() {} }) },
      Pressable: 'Pressable', Text: 'Text', View: 'View', StyleSheet: { create: value => value },
    },
    'expo-modules-core': {
      requireOptionalNativeModule: () => ({
        platform: { ios: { buildNumber: '1.0.216' } },
        manifest: { ios: { bundleIdentifier: 'com.hiddentunes.app' } },
        executionEnvironment: 'bare',
      }),
    },
    '@react-native-async-storage/async-storage': {
      getItem: async () => null,
      setItem: async () => { if (storageFails) throw new Error('storage write failed'); },
    },
    'expo-router': {
      usePathname: () => route,
      useGlobalSearchParams: () => ({}),
      router: {
        replace: destination => navigation.push(['replace', destination]),
        push: destination => navigation.push(['push', destination]),
      },
    },
    '../hooks/useIosOperationalPolicy': {
      useIosOperationalPolicy: () => ({
        ...service.getIosOperationalPolicySnapshot(),
        sectionEnabled: service.iosOperationalSectionEnabled,
      }),
      useIosOperationalItemVisibility: ref => service.isIosOperationalItemVisible(ref),
    },
  };

  function load(relative) {
    const full = path.resolve(root, relative);
    if (modules.has(full)) return modules.get(full).exports;
    const module = { exports: {} };
    modules.set(full, module);
    const source = fs.readFileSync(full, 'utf8');
    const compiled = ts.transpileModule(source, {
      fileName: full,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const requireLocal = name => {
      if (name === 'react/jsx-runtime') return require(name);
      if (Object.hasOwn(mocks, name)) return mocks[name];
      assert.ok(name.startsWith('.'), `unexpected import ${name}`);
      const next = path.resolve(path.dirname(full), name);
      return load(path.relative(root, next + (path.extname(next) ? '' : '.ts')));
    };
    vm.runInNewContext(compiled, {
      module, exports: module.exports, require: requireLocal, console,
      URL, URLSearchParams, Headers, AbortController,
      setTimeout: (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
      clearTimeout: id => timers.delete(id),
      fetch: async (_url, init) => {
        requests++;
        if (fault === 'network') throw new Error('temporary network failure');
        if (fault === 'timeout') {
          const timer = [...timers.values()].at(-1);
          assert.equal(timer?.delay, 7000);
          timer.callback();
          assert.equal(init.signal.aborted, true);
          throw new Error('request aborted');
        }
        if (fault === 'http') return { ok: false, status: 503, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => fault === 'malformed' ? { ...policy, version: 2 } : fault === 'stale' ? { ...policy, revision: 0 } : policy };
      },
    }, { filename: full });
    return module.exports;
  }

  service = load('services/iosOperationalPolicy.ts');
  const Boundary = load('components/IosOperationalRouteBoundary.tsx').default;

  function screen() {
    const rootElement = Boundary({ children: 'EXISTING_ROUTE' });
    const output = { text: [], buttons: [] };
    function textOf(node) {
      if (node == null || typeof node === 'boolean') return '';
      if (Array.isArray(node)) return node.map(textOf).join('');
      if (typeof node !== 'object') return String(node);
      return textOf(node.props?.children);
    }
    function visit(node) {
      if (node == null || typeof node === 'boolean') return;
      if (Array.isArray(node)) { node.forEach(visit); return; }
      if (typeof node !== 'object') { output.text.push(String(node)); return; }
      if (typeof node.type === 'function') { visit(node.type(node.props)); return; }
      if (node.type === 'Pressable') output.buttons.push({ label: textOf(node.props.children), onPress: node.props.onPress });
      visit(node.props?.children);
    }
    visit(rootElement);
    return { text: output.text.join(' '), buttons: output.buttons };
  }

  return {
    service, screen, navigation,
    requestCount: () => requests,
    route: value => { route = value; },
    fault: value => { fault = value; },
    storageFails: value => { storageFails = value; },
    active: controls => {
      policy = { ...policy, revision: policy.revision + 1, enforcementEnabled: true,
        profileActive: true, mode: 'active', controls };
    },
  };
}

const activeControls = [
  { id: 'ios', parentId: null, enabled: true },
  { id: 'section:radio', parentId: 'ios', enabled: false },
  { id: 'section:podcasts', parentId: 'ios', enabled: true },
  { id: 'mature', parentId: 'ios', enabled: false },
];
const has = (screen, label) => screen.buttons.some(button => button.label === label);
const press = (screen, label) => {
  const button = screen.buttons.find(item => item.label === label);
  assert.ok(button, `${label} action exists`);
  button.onPress();
};
async function settle(predicate) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.ok(predicate(), 'policy refresh settled');
}

async function main() {
  const normal = fixture();
  assert.equal((await normal.service.refreshIosOperationalPolicy(true)).status, 'legacy');
  assert.equal(normal.screen().text.includes('EXISTING_ROUTE'), true, 'valid legacy route visible');
  assert.equal(normal.screen().text.includes('This content is unavailable'), false);

  const denied = fixture();
  denied.active(activeControls);
  await denied.service.refreshIosOperationalPolicy(true);
  assert.equal(denied.screen().text.includes('This content is unavailable'), true, 'explicit section OFF remains blocked');
  assert.equal(has(denied.screen(), 'Retry'), false, 'explicit OFF is not a transient error');
  denied.route('/podcasts/mature');
  assert.equal(denied.screen().text.includes('This content is unavailable'), true, 'explicit mature OFF remains blocked');
  denied.route('/podcasts/show/00000000-0000-4000-8000-000000000001');
  assert.equal(denied.screen().text.includes('This content is unavailable'), true, 'unresolved detail remains blocked');
  denied.route('/radio');

  for (const cause of ['network', 'timeout', 'malformed', 'stale', 'http', 'storage']) {
    const temporary = fixture();
    await temporary.service.refreshIosOperationalPolicy(true);
    if (cause === 'storage') temporary.storageFails(true);
    else temporary.fault(cause);
    assert.equal((await temporary.service.refreshIosOperationalPolicy(true)).status, 'unavailable', `${cause} marks policy unavailable`);
    const fallback = temporary.screen();
    assert.equal(fallback.text.includes('Unable to check availability'), true, `${cause} is described as verification failure`);
    assert.equal(fallback.text.includes('This content is unavailable'), false, `${cause} is not explicit denial`);
    assert.equal(has(fallback, 'Retry'), true);
    assert.equal(has(fallback, 'More'), true);
    assert.equal(has(fallback, 'Account and settings'), true);
    assert.equal(fallback.text.includes('EXISTING_ROUTE'), true, 'existing route stays mounted behind the mask');
    if (cause === 'network') {
      press(fallback, 'More');
      press(fallback, 'Account and settings');
      assert.equal(JSON.stringify(temporary.navigation), JSON.stringify([['replace', '/more'], ['push', '/profile']]));
      temporary.fault(null);
      const before = temporary.requestCount();
      press(fallback, 'Retry');
      await settle(() => temporary.service.getIosOperationalPolicySnapshot().status === 'legacy');
      assert.equal(temporary.requestCount(), before + 1, 'Retry starts an immediate forced request');
      assert.equal(temporary.screen().text.includes('Unable to check availability'), false, 'valid reply restores route');
    }
  }

  const automatic = fixture();
  await automatic.service.refreshIosOperationalPolicy(true);
  automatic.fault('network');
  await automatic.service.refreshIosOperationalPolicy(true);
  automatic.fault(null);
  await automatic.service.refreshIosOperationalPolicy(true); // The hook's existing 15-second forced refresh.
  assert.equal(automatic.screen().text.includes('Unable to check availability'), false, 'next valid refresh restores route');

  denied.fault('network');
  await denied.service.refreshIosOperationalPolicy(true);
  assert.equal(has(denied.screen(), 'Retry'), true);
  denied.fault(null);
  press(denied.screen(), 'Retry');
  await settle(() => denied.service.getIosOperationalPolicySnapshot().status === 'active');
  assert.equal(denied.screen().text.includes('This content is unavailable'), true, 'valid explicit OFF remains blocked after retry');
  assert.equal(has(denied.screen(), 'Retry'), false);

  console.log('PASS iOS 1.0.216 policy route recovery: legacy, explicit section/mature/detail denial, six transient failures, immediate retry, automatic recovery, safe exits, explicit OFF after retry.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
