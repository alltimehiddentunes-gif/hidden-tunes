/** Actual JS owner callbacks + Swift source contracts; no Swift/device/runtime claim. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const swiftPath = 'plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioModule.swift';
const swift = fs.readFileSync(path.join(root, swiftPath), 'utf8').replace(/\r\n/g, '\n');
const baseline = execFileSync('git', ['show', `1c5b9d1826dda057ca2bb87338a08e8cab2371a5:${swiftPath}`], { cwd: root, encoding: 'utf8' });

function block(source, marker) {
  const markerAt = source.indexOf(marker); assert.ok(markerAt >= 0, marker);
  const start = source.indexOf('{', markerAt); let depth = 0;
  for (let i = start; i < source.length; i++) { if (source[i] === '{') depth++; else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1); }
  throw new Error(`Unclosed source block: ${marker}`);
}
function swiftContracts() {
  const selector = block(swift, 'private var requiresIos216PolicyAuthorization');
  assert.match(selector, /Bundle\.main\.bundleIdentifier == "com\.hiddentunes\.app"/);
  assert.match(selector, /&& \(Bundle\.main\.object\(forInfoDictionaryKey: "CFBundleVersion"\) as\? String\) == "1\.0\.216"/);
  assert.doesNotMatch(selector, />=|startsWith|hasPrefix|UserDefaults|activeTrack|manifest/);
  const defer = block(swift, 'private func deferIos216ResumeToJs');
  assert.ok(defer.indexOf('guard requiresIos216PolicyAuthorization else { return false }') < defer.indexOf('emitDiagnostic'));
  assert.match(defer, /"ios_remote_command_received"/); assert.match(defer, /"command": "play"/);
  assert.match(defer, /"trackId": activeTrack\?\["id"\]/); assert.match(defer, /"reason": reason/);
  assert.doesNotMatch(defer, /\.play\(|loadTrack|shouldResumeAfterItemLoad = true|playerStatus =/);
  const play = block(swift, 'commandCenter.playCommand.addTarget');
  assert.ok(play.indexOf('if self.deferIos216ResumeToJs(reason: "remote_play") { return .success }') < play.indexOf('self.player?.play()'));
  const toggle = block(swift, 'commandCenter.togglePlayPauseCommand.addTarget');
  assert.ok(toggle.indexOf('if self.playerStatus != "playing" && self.deferIos216ResumeToJs(reason: "remote_toggle") { return .success }') < toggle.indexOf('self.player?.play()'));
  assert.match(toggle, /"command": self\.requiresIos216PolicyAuthorization \? "pause" : "toggle"/);
  assert.ok(toggle.includes('self.player?.pause()'), 'native toggle-pause still pauses immediately');
  const background = block(swift, 'private func reassertBackgroundPlaybackIfNeeded');
  const deferredAt = background.indexOf('if deferIos216ResumeToJs(reason: "background:\\(reason)") { return }');
  assert.ok(deferredAt > background.indexOf('if currentPlayer.rate > 0 || currentPlayer.timeControlStatus == .playing'));
  assert.ok(deferredAt < background.indexOf('currentPlayer.play()'));
  assert.ok(background.indexOf('if audioInterruptionActive') < deferredAt);
  assert.ok(background.indexOf('if hasRecentIntentionalPause()') < deferredAt);
  for (const marker of ['commandCenter.pauseCommand.addTarget', 'commandCenter.nextTrackCommand.addTarget', 'commandCenter.previousTrackCommand.addTarget', '@objc private func audioInterruption', 'func play(resolve:', 'func pause(resolve:']) assert.equal(block(swift, marker), block(baseline, marker), `${marker} unchanged`);
  assert.equal((swift.match(/@objc\(/g) || []).length, (baseline.match(/@objc\(/g) || []).length, 'no new native bridge API');
  assert.equal((swift.match(/\.play\(\)/g) || []).length, (baseline.match(/\.play\(\)/g) || []).length, 'no additional direct native play site');
}

const source = fs.readFileSync(path.join(root, 'context/PlayerContext.tsx'), 'utf8');
const parsed = ts.createSourceFile('PlayerContext.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function callback(name) {
  let result;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === name && node.initializer && ts.isCallExpression(node.initializer)) result = node.initializer.arguments[0].getText(parsed);
    ts.forEachChild(node, visit);
  }
  visit(parsed); assert.ok(result, name); return result;
}
const script = ts.transpileModule([
  `globalThis.pauseIosRevokedPlayback = ${callback('pauseIosRevokedPlayback')};`,
  `globalThis.bridgeHiddenAudioPlay = ${callback('bridgeHiddenAudioPlay')};`,
  `globalThis.loadAndPlay = ${callback('loadAndPlay')};`,
  `globalThis.dispatch = ${callback('dispatchIosRemoteLockscreenCommand')};`,
].join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const mureka = '00000000-0000-4000-8000-000000000001';
const djcity = '00000000-0000-4000-8000-000000000002';
function fixture(controlled = true, platform = 'ios') {
  let owner = 'shared-audio', nativePlaying = false, recentPause = false, interrupted = false;
  const actions = [], authorizations = [];
  const song = { id: mureka, url: 'https://controlled.invalid/music?ticket=existing' };
  const context = {
    console, IOS_OPERATIONAL_PLATFORM: controlled, Platform: { OS: platform },
    currentSongRef: { current: song }, activeQueueRef: { current: Object.freeze([song, { id: djcity }]) },
    manualQueueCommandGenerationRef: { current: 0 }, iosAuthorizationGenerationRef: { current: 0 }, loadRequestIdRef: { current: 0 },
    continuationUserIntentRef: { current: 'playing' }, positionMillisRef: { current: 34500 }, isPlayingRef: { current: false }, soundRef: { current: null },
    getActivePlaybackOwner: () => owner, hasRecentIntentionalPause: () => recentPause, isIosAudioInterruptionActive: () => interrupted,
    clearIntentionalPause: () => { recentPause = false; }, markIntentionalPause: () => { recentPause = true; },
    logLockscreenPlaybackDiagnostic: () => {}, isHiddenAudioNativePlaybackEnabled: () => platform === 'android',
    bridgeProbeNativePlayback: async () => ({}), isHiddenAudioBridgePlayBlocked: () => false, nativeSnapshotCanPreserveSession: () => true,
    authorizeIosOperationalSong: async item => { authorizations.push(item.id); if (item.id === djcity) throw new Error('DJcity OFF'); return item; },
    playExistingNativeAudio: async () => { nativePlaying = true; actions.push('play'); },
    bridgeHiddenAudioPause: async () => { nativePlaying = false; actions.push('pause'); },
    loadAndPlayRef: { current: null },
    setIsPlaying: value => { context.isPlayingRef.current = value; }, setIsPlayingState: value => { context.isPlayingRef.current = value; }, setIsLoading: () => {},
    syncHiddenAudioState: async reason => { context.isPlayingRef.current = nativePlaying; actions.push({ sync: reason }); return { isPlaying: nativePlaying, positionMillis: context.positionMillisRef.current, durationMillis: 100000 }; },
    dispatchTvRemoteTransportCommand: async command => actions.push({ tv: command }),
    __DEV__: false, normalizeSong: item => item, shouldIgnoreDuplicatePlayRequest: () => false,
    activeQueueIndexRef: { current: 0 }, activeQueueModeRef: { current: 'queue' }, activeQueueContextRef: { current: null },
    durationMillisRef: { current: 100000 }, inFlightPlaySongIdRef: { current: null }, isChangingTrackRef: { current: false },
    autoAdvanceRef: { current: false }, lastFinishEventRef: { current: { songId: '', handledAt: 0 } }, isMountedRef: { current: true },
    hiddenAudioActiveRef: { current: false }, playbackInterruptionActiveRef: { current: false }, preloadedSongIdRef: { current: null },
    skipEmotionalQueueRefreshRef: { current: true }, radioModeRef: { current: false }, liveRadioSkipCycleRef: { current: null },
    appStateRef: { current: 'active' }, POSITION_KEY: 'position',
    setCurrentSong: item => { context.currentSongRef.current = item; }, setActiveQueue: () => {}, setActiveQueueIndex: () => {}, setActiveQueueMode: () => {},
    setPositionMillis: value => { context.positionMillisRef.current = value; }, setDurationMillis: value => { context.durationMillisRef.current = value; },
    shouldUseHiddenAudioPlayback: async () => true, getPlayableUri: item => item.streamUrl || item.url,
    isYouTubeSong: () => false, isLiveRadioPlaybackDomain: () => false, isBackgroundAppState: () => false,
    unloadCurrentSound: async () => {}, clearPreloadedSound: async () => {}, getSongDurationSeconds: () => 100, getArtworkValue: () => '',
    activateHiddenAudioPlayback: async track => { if (!track.shouldPlay()) return false; actions.push({ load: track }); nativePlaying = true; return true; },
    syncNativeRemoteQueueAvailability: async () => {}, removeStoredValues: async () => {}, configureAudio: async () => {},
  };
  for (const name of ['armLoadingRecoveryTimeout', 'clearLoadingRecoveryTimeout', 'clearFinishWatchdog', 'logPlayerContextDebug', 'logAudioLoadStart', 'logAudioLoadFailure', 'logAudioLoadSuccess', 'logPlaybackCritical', 'logTapLatencyDiagnostic', 'logTapToLoadTrackRequired', 'clearHiddenAudioBridgePlayBlock', 'logTapToPlayFailed', 'logTapToPlayConfirmed', 'logPlaybackStarted', 'deferPlaybackSideEffects', 'logDuplicatePlayIgnored']) context[name] = () => {};
  vm.runInNewContext(script, context, { filename: 'actual-player-callbacks.js' });
  context.loadAndPlayRef.current = context.loadAndPlay;
  return { context, actions, authorizations, setOwner: value => { owner = value; }, setPause: value => { recentPause = value; }, setInterrupted: value => { interrupted = value; }, setNativePlaying: value => { nativePlaying = value; } };
}
const nativeEvent = (id, reason = 'remote_play') => ({ source: 'ios216_native_resume', owner: 'shared-audio', trackId: id, reason });

const bridgeFile = ts.createSourceFile('playbackBridge.ts', fs.readFileSync(path.join(root, 'services/playbackBridge.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
const bridgeFunctions = ['activateHiddenAudioPlayback', 'bridgeHiddenAudioPlay'].map(name => {
  const declaration = bridgeFile.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration, name);
  return declaration.getText(bridgeFile).replace(/^export\s+/, '');
});
const bridgeScript = ts.transpileModule([...bridgeFunctions, 'globalThis.activate = activateHiddenAudioPlayback; globalThis.resume = bridgeHiddenAudioPlay;'].join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function bridgeFixture() {
  const actions = [];
  const context = {
    hiddenAudioBridgeActive: false, hiddenAudioBridgePlayBlocked: false,
    isHiddenAudioNativePlaybackEnabled: () => true, getHiddenAudioNativeSnapshot: async () => ({}),
    getHiddenAudioLoadedUrl: () => 'https://controlled.invalid/music', nativeSnapshotRequiresReload: () => false,
    hiddenAudioBridge: { load: async () => actions.push('load'), seek: async () => actions.push('seek'), play: async () => actions.push('play') },
  };
  for (const name of ['logAndRememberLockscreenDiagnostic', 'logPlaybackCritical', 'logTapToPlayFailed', 'logTapToPlayConfirmed', 'clearHiddenAudioBridgePlayBlock', 'markHiddenAudioBridgeActive', 'resetHiddenAudioLoadedUrl', 'blockHiddenAudioBridgePlay', 'logAndroidPlaybackParityDiagnostic']) context[name] = () => {};
  vm.runInNewContext(bridgeScript, context, { filename: 'actual-playback-bridge.js' });
  return { context, actions };
}
async function bridgeRaces() {
  for (const boundary of ['snapshot', 'seek']) for (const replacement of ['owner', 'manual-command', 'load-request', 'generation', 'pause']) {
    const f = fixture(), native = bridgeFixture();
    f.context.continuationUserIntentRef.current = 'paused';
    let finish, notify;
    const started = new Promise(resolve => { notify = resolve; });
    const delayed = () => { notify(); return new Promise(resolve => { finish = () => resolve({}); }); };
    if (boundary === 'snapshot') {
      native.context.getHiddenAudioNativeSnapshot = delayed;
      f.context.playExistingNativeAudio = native.context.resume;
    } else {
      native.context.hiddenAudioBridge.seek = delayed;
      f.context.authorizeIosOperationalSong = async item => ({ ...item, url: 'https://controlled.invalid/music?ticket=fresh' });
      f.context.activateHiddenAudioPlayback = native.context.activate;
    }
    const pending = f.context.dispatch('play', nativeEvent(mureka)); await started;
    if (replacement === 'owner') f.setOwner('tv');
    if (replacement === 'manual-command') f.context.manualQueueCommandGenerationRef.current++;
    if (replacement === 'load-request') f.context.loadRequestIdRef.current++;
    if (replacement === 'generation') f.context.iosAuthorizationGenerationRef.current++;
    if (replacement === 'pause') await f.context.dispatch('pause');
    finish(); await pending;
    assert.equal(native.actions.includes('play'), false, `${replacement} during ${boundary} blocks native play`);
    assert.equal(f.context.continuationUserIntentRef.current, 'paused');
  }
  // Uncontrolled callers do not supply the new predicate and retain their existing behavior.
  for (const allowed of [undefined, true, false]) {
    const direct = bridgeFixture();
    await direct.context.resume(allowed === undefined ? undefined : () => allowed);
    assert.equal(direct.actions.includes('play'), allowed !== false);
    const reload = bridgeFixture();
    const result = await reload.context.activate({ url: 'https://controlled.invalid/music', title: 'Fixture', artist: 'Fixture', positionSeconds: 34.5, shouldPlay: () => true, ...(allowed === undefined ? {} : { revalidateBeforePlay: () => allowed }) });
    assert.equal(result, allowed !== false); assert.equal(reload.actions.includes('play'), allowed !== false);
  }
}

async function main() {
  swiftContracts();
  await bridgeRaces();
  for (const command of ['play', 'toggle']) {
    const denied = fixture(); denied.context.currentSongRef.current = { id: djcity, url: 'https://cached.invalid/djcity.mp3' };
    const queue = denied.context.activeQueueRef.current;
    await denied.context.dispatch(command, command === 'play' ? nativeEvent(djcity) : {});
    assert.deepEqual(denied.authorizations, [djcity]); assert.equal(denied.actions.includes('play'), false);
    assert.equal(denied.actions.some(action => action.load), false); assert.equal(denied.context.isPlayingRef.current, false);
    assert.equal(denied.context.activeQueueRef.current, queue, 'denial preserves queue membership');
    const allowed = fixture(); await allowed.context.dispatch(command, command === 'play' ? nativeEvent(mureka) : {});
    assert.deepEqual(allowed.authorizations, [mureka]); assert.equal(allowed.actions.includes('play'), true); assert.equal(allowed.context.isPlayingRef.current, true);
  }
  for (const command of ['play', 'toggle']) {
    const cached = fixture(); cached.context.continuationUserIntentRef.current = 'paused';
    cached.context.authorizeIosOperationalSong = async item => { cached.authorizations.push(item.id); return { ...item, url: 'https://controlled.invalid/music?ticket=fresh' }; };
    await cached.context.dispatch(command, command === 'play' ? nativeEvent(mureka) : {});
    const loaded = cached.actions.find(action => action.load);
    assert.equal(loaded.load.url, 'https://controlled.invalid/music?ticket=fresh'); assert.equal(loaded.load.positionSeconds, 34.5);
    assert.equal(cached.actions.includes('play'), false, 'old cached URL is never resumed when a fresh asset must be loaded');
    assert.deepEqual(cached.authorizations, [mureka, mureka], 'actual nested load performs its second authorization');
    assert.equal(cached.context.continuationUserIntentRef.current, 'playing', 'successful own reload advances intent from paused');
    assert.equal(cached.context.isPlayingRef.current, true);
    assert.equal(cached.actions.some(action => action.sync === `ios216_remote_${command}`), true);
  }

  for (const replacement of ['owner', 'manual-command', 'load-request', 'identity', 'same-id-generation', 'pause']) for (const allow of [true, false]) {
    const f = fixture(); f.context.continuationUserIntentRef.current = 'paused';
    let finish, fail, notified, calls = 0;
    const requested = new Promise(resolve => { notified = resolve; });
    f.context.authorizeIosOperationalSong = async item => {
      if (++calls === 1) return { ...item, url: 'https://controlled.invalid/music?ticket=fresh' };
      notified(); return new Promise((resolve, reject) => { finish = () => resolve(item); fail = () => reject(new Error('late nested denial')); });
    };
    const pending = f.context.dispatch('play', nativeEvent(mureka)); await requested;
    assert.equal(f.actions.length, 0, 'second authorization precedes load or state changes');
    if (replacement === 'owner') f.setOwner('tv');
    if (replacement === 'manual-command') f.context.manualQueueCommandGenerationRef.current++;
    if (replacement === 'load-request') f.context.loadRequestIdRef.current++;
    if (replacement === 'identity') f.context.currentSongRef.current = { id: djcity, url: 'https://new.invalid/track' };
    if (replacement === 'same-id-generation') f.context.iosAuthorizationGenerationRef.current++;
    if (replacement === 'pause') await f.context.dispatch('pause');
    const before = f.actions.length;
    if (allow) finish(); else fail();
    await pending;
    assert.equal(f.actions.length, before, `nested late ${allow ? 'allow' : 'deny'} cannot affect ${replacement}`);
    assert.equal(f.context.continuationUserIntentRef.current, 'paused');
  }
  for (const failure of ['duplicate', 'unavailable-engine', 'native-not-playing', 'missing-reload', 'second-denial']) {
    const f = fixture(); f.context.continuationUserIntentRef.current = 'paused'; let calls = 0;
    f.context.authorizeIosOperationalSong = async item => { if (++calls === 2 && failure === 'second-denial') throw new Error('revoked during second authorization'); return { ...item, url: 'https://controlled.invalid/music?ticket=fresh' }; };
    if (failure === 'duplicate') f.context.shouldIgnoreDuplicatePlayRequest = () => true;
    if (failure === 'unavailable-engine') f.context.shouldUseHiddenAudioPlayback = async () => false;
    if (failure === 'native-not-playing') f.context.activateHiddenAudioPlayback = async () => false;
    if (failure === 'missing-reload') f.context.loadAndPlayRef.current = null;
    await f.context.dispatch('play', nativeEvent(mureka));
    assert.equal(f.context.continuationUserIntentRef.current, 'paused', `${failure} is not a successful resume`);
    assert.equal(f.actions.some(action => action.sync === 'ios216_remote_play'), false);
  }

  for (const issue of ['track', 'owner', 'paused', 'stopped', 'interrupted', 'cooldown', 'interruption']) {
    const f = fixture();
    if (issue === 'owner') f.setOwner('tv');
    if (['paused', 'stopped', 'interrupted'].includes(issue)) f.context.continuationUserIntentRef.current = issue;
    if (issue === 'cooldown') f.setPause(true);
    if (issue === 'interruption') f.setInterrupted(true);
    await f.context.dispatch('play', nativeEvent(issue === 'track' ? djcity : mureka, 'background:time_control_paused'));
    assert.equal(f.authorizations.length, 0, `${issue} recovery is rejected before authorization`); assert.equal(f.actions.length, 0);
  }
  const background = fixture(); background.context.currentSongRef.current = { id: djcity, url: 'https://cached.invalid/djcity' };
  await background.context.dispatch('play', nativeEvent(djcity, 'background:app_entered_background'));
  assert.deepEqual(background.authorizations, [djcity]); assert.equal(background.actions.includes('play'), false);

  for (const replacement of ['pause', 'owner', 'same-id-generation']) for (const allow of [true, false]) {
    const f = fixture(); let finish, fail, notified;
    const requested = new Promise(resolve => { notified = resolve; });
    f.context.authorizeIosOperationalSong = item => { notified(); return new Promise((resolve, reject) => { finish = () => resolve(item); fail = () => reject(new Error('late denial')); }); };
    const pending = f.context.dispatch('play', nativeEvent(mureka)); await requested;
    assert.equal(f.actions.length, 0, 'native play waits for authorization');
    if (replacement === 'pause') await f.context.dispatch('pause');
    if (replacement === 'owner') f.setOwner('tv');
    if (replacement === 'same-id-generation') f.context.iosAuthorizationGenerationRef.current++;
    const before = f.actions.length;
    if (allow) finish(); else fail();
    await pending;
    assert.equal(f.actions.length, before, `late ${allow ? 'allow' : 'deny'} cannot affect ${replacement}`);
    assert.equal(f.actions.includes('play'), false);
  }
  for (const platform of ['ios', 'android', 'web', 'windows', 'macos', 'linux', 'amazon-fire']) {
    const f = fixture(false, platform); f.setNativePlaying(true);
    await f.context.dispatch('play'); assert.equal(f.authorizations.length, 0, `${platform} legacy unchanged`);
    const toggle = fixture(false, platform); await toggle.context.dispatch('toggle'); assert.equal(toggle.authorizations.length, 0); assert.equal(toggle.context.isPlayingRef.current, true);
  }
  const tv = fixture(); tv.setOwner('tv'); await tv.context.dispatch('play', { owner: 'presented' });
  assert.deepEqual(tv.actions, [{ tv: 'play' }]); assert.equal(tv.authorizations.length, 0, 'TV transport remains with its current owner');
  console.log('PASS216 native resume source/JS contracts: immutable Swift selector; remote/background deferral; DJcity denied, Mureka allowed; cached URL replacement; stale recovery/owner/pause races;215/non-iOS legacy. Swift compilation/device NOT performed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
