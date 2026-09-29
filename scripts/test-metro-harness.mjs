import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(fs.readFileSync('utils/metroPlaybackHarness.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
for (const available of [true, false]) {
  const events = [];
  const calls = [];
  let cleanups = 0;
  let nativeListener;
  const native = Object.fromEntries(['setup', 'loadTrack', 'play', 'pause', 'stop', 'seekTo', 'setVolume', 'getActiveTrack', 'getProgress', 'addListener', 'removeListeners'].map(name => [name, () => calls.push(name)]));
  native.getState = async () => { calls.push('getState'); return { status: 'idle' }; };
  const subscribe = () => () => cleanups++;
  const context = vm.createContext({ exports: {}, console, fetch: async (_url, req) => events.push(...JSON.parse(req.body)),
    require(name) {
      if (name === 'react-native') return {
        Alert: { alert: () => {} },
        NativeModules: available ? { HiddenAudioModule: native } : {}, Platform: { OS: 'ios' },
        TurboModuleRegistry: { get: () => ({ getConstants: () => ({ scriptURL: 'http://172.20.10.6:8081/index.bundle' }) }) },
        NativeEventEmitter: class { addListener(_name, listener) { nativeListener = listener; return { remove: () => cleanups++ }; } },
      };
      if (name === './playbackCriticalLogs') return { getPlaybackCriticalLogs: () => [], subscribePlaybackCriticalLogs: subscribe };
      if (name === './lockscreenPlaybackDiagnostics') return { getLockscreenPlaybackDiagnosticLogs: () => [], subscribeLockscreenPlaybackDiagnostics: subscribe };
      throw new Error(name);
    },
  });
  vm.runInContext(code, context);
  await new Promise(resolve => setImmediate(resolve));
  assert(events.some(e => e.event === (available ? 'module_available' : 'module_missing')));
  assert.deepEqual(calls, available ? ['getState'] : [], 'Observer must not invoke playback operations');
  if (available) {
    nativeListener({ eventName: 'hidden_audio_native_player_created', data: { url: 'https://secret.example/token', trackId: 'known-test-id' } });
    await new Promise(resolve => setImmediate(resolve));
    const event = events.find(e => e.event === 'hidden_audio_native_player_created');
    assert.equal(event.details.trackId, 'known-test-id');
    assert.equal(event.details.url, undefined);
  }
  context.__htHarnessDispose();
  assert.equal(cleanups, available ? 3 : 2);
}
const entry = fs.readFileSync('index.js', 'utf8');
assert.match(entry, /if \(process\.env\.EXPO_PUBLIC_METRO_HARNESS === "1"\)/);
console.log('PASS: native availability, read-only probe, bounded event selection, URL exclusion and listener cleanup');
