import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const eas = JSON.parse(read('eas.json'));
const dev = eas.build.ios217PerfDiagnostic;
const production = eas.build.production;
assert.equal(dev.developmentClient, true);
assert.equal(dev.distribution, 'internal');
assert.equal(dev.channel, 'ios-217-perf');
assert.equal(dev.environment, 'production');
assert.equal(dev.env.EXPO_PUBLIC_BUILD_PROFILE, 'production');
assert.equal(dev.env.HT_IOS217_PERF_DEVCLIENT, '1');
assert.match(read('app.config.js'), /process\.env\.HT_IOS217_PERF_DEVCLIENT === "1"/);
for (const [name, value] of Object.entries(production.env)) {
  if (name.startsWith('EXPO_PUBLIC_')) assert.equal(dev.env[name], value, `${name} differs from production`);
}

const plugin = read('plugins/hidden-audio/index.js');
const swift = read('plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioModule.swift');
const bridge = read('plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioModule.m');
const recorder = read('plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioPerfRecorder.swift');
const releaseSwift = execFileSync('git', ['show', '48c5170c:plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioModule.swift'], { encoding: 'utf8' });
assert.match(plugin, /"HiddenAudioPerfRecorder\.swift"/);
for (const method of ['getPerformanceSnapshot', 'resetPerformanceSnapshot']) {
  assert.match(swift, new RegExp(`@objc\\(${method}:`));
  assert.match(bridge, new RegExp(`RCT_EXTERN_METHOD\\(${method}:`));
}
assert.match(swift, /HTNativePlaybackDiagnostic/);
const selectors = source => Array.from(source.matchAll(/@objc\(([^)]+)\)/g), match => match[1]);
const diagnosticSelectors = new Set(['getPerformanceSnapshot:rejecter:', 'resetPerformanceSnapshot:rejecter:']);
assert.deepEqual(selectors(swift).filter(selector => !diagnosticSelectors.has(selector)), selectors(releaseSwift),
  'all 217 native bridge selectors and their order must remain intact');
assert.equal((swift.match(/\.play\(\)/g) ?? []).length, (releaseSwift.match(/\.play\(\)/g) ?? []).length,
  'no new native play site');
assert.equal((swift.match(/\.pause\(\)/g) ?? []).length, (releaseSwift.match(/\.pause\(\)/g) ?? []).length,
  'no new native pause site');
assert.doesNotMatch(recorder, /sendEvent\s*\(|console\.log|NSLog|URLSession|fetch\s*\(/);
assert.doesNotMatch(recorder, /checkpoint|jsCheckpoint/,
  'native recorder must not require periodic JS bridge checkpoints');
assert.equal((recorder.match(/UserDefaults\.standard\.set\(/g) ?? []).length, 1,
  'native recorder may write only one bounded severe-stall snapshot');
assert.match(recorder, /if delayedMs > 2000 && !incidentWritten/);
console.log('iOS 217 internal perf build gate passed');
