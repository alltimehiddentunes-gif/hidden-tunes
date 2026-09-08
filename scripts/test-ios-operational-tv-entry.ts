import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Execute the actual owner callbacks with fake transports/surfaces. No native runtime or network.
const source = readFileSync(new URL("../context/TvPlaybackContext.tsx", import.meta.url), "utf8");
const file = ts.createSourceFile("TvPlaybackContext.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function ownerCallback(name: string) {
  let result = "";
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === name && node.initializer && ts.isCallExpression(node.initializer)) result = node.initializer.arguments[0].getText(file);
    ts.forEachChild(node, visit);
  }
  visit(file); assert.ok(result, name); return result;
}
const helpers = ["authorizedTvPlayback", "pauseIosDeniedTvPlayback"].map((name) => {
  const fn = file.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(fn, name); return fn.getText(file);
}).join("\n");
const js = ts.transpileModule(`${helpers}\nglobalThis.retry = ${ownerCallback("handleRetry")};\nglobalThis.resume = ${ownerCallback("authorizeTvResume")};\nglobalThis.toggle = ${ownerCallback("handleTogglePlayback")};`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
const id = "00000000-0000-4000-8000-000000000001";
const authorization = { enforced: true, revision: 1, delivery: "direct", playbackUrl: "https://controlled.invalid/current.m3u8" };
function fixture(ios = true) {
  const calls: { name: string; value?: any }[] = [];
  const original = { id, source_type: "hls_stream", source_id: id, stream_url: "https://stale.invalid/cached.m3u8", embed_url: null };
  let owner = "tv";
  const context: any = {
    URL, IOS_OPERATIONAL_PLATFORM: ios, currentItemRef: { current: { id } }, currentPlayback: original,
    iosTvAuthorizationGenerationRef: { current: 0 }, sessionIdRef: { current: 1 }, surfaceRef: { current: "native" },
    isPlayingRef: { current: false },
    tvQueueRef: { current: Object.freeze([{ id }]) }, presentationModeRef: { current: "floating" },
    getActivePlaybackOwner: () => owner,
    iosOperationalMatureAccess: async () => ({}),
    resolveIosOperationalPlayback: async (ref: any) => { calls.push({ name: "authorize", value: ref }); return authorization; },
    assertIosOperationalContentAllowed: async () => { calls.push({ name: "assert" }); throw new Error("denied"); },
    resolveTvPlaybackSurface: (playback: any) => playback.embed_url ? "webview" : "native",
    nativePlayerRef: { current: { pause: () => calls.push({ name: "pause" }), play: () => calls.push({ name: "play" }) } },
    webViewRef: { current: { injectJavaScript: (script: string) => calls.push({ name: "inject", value: script }) } },
  };
  for (const name of ["setHasError", "setIsTvLoading", "setIsTvPlaying", "setPlayerGeneration", "setCurrentPlayback", "setSurface"]) {
    context[name] = (value: any) => calls.push({ name, value: typeof value === "function" ? value(4) : value });
  }
  runInNewContext(js, context);
  context.authorizeTvResume = context.resume;
  return { context, calls, original, setOwner: (value: string) => { owner = value; } };
}

async function main() {
  const other = fixture(false);
  const otherPending = other.context.retry();
  assert.equal(other.calls.some((c) => c.name === "setPlayerGeneration"), true, "non-iOS retry retains synchronous existing state changes");
  await otherPending;
  assert.equal(other.calls.some((c) => c.name === "authorize"), false);

  const legacy = fixture();
  legacy.context.resolveIosOperationalPlayback = async () => ({ enforced: false });
  await legacy.context.retry();
  assert.equal(legacy.calls.some((c) => c.name === "setPlayerGeneration"), true);
  assert.equal(legacy.calls.some((c) => c.name === "setCurrentPlayback"), false, "legacy playback DTO remains intact");

  const active = fixture();
  await active.context.retry();
  assert.equal(active.calls[0].name, "authorize");
  assert.equal(active.calls[0].value.id, id);
  const binding = active.calls.find((c) => c.name === "setCurrentPlayback")!;
  assert.equal(binding.value.stream_url, authorization.playbackUrl);
  assert.ok(active.calls.indexOf(binding) < active.calls.findIndex((c) => c.name === "setPlayerGeneration"), "fresh asset must bind before remount");
  assert.equal(active.original.stream_url, "https://stale.invalid/cached.m3u8", "saved input remains unchanged");

  const denied = fixture();
  denied.context.resolveIosOperationalPlayback = async () => { throw new Error("disabled"); };
  await denied.context.retry();
  assert.equal(denied.calls.some((c) => c.name === "setPlayerGeneration"), false, "denied Retry cannot remount cached URL");
  assert.equal(denied.calls.some((c) => c.name === "pause"), true);
  assert.equal(denied.calls.find((c) => c.name === "setHasError")?.value, true);
  const preservedQueue = denied.context.tvQueueRef.current;
  denied.calls.length = 0;
  denied.context.resolveIosOperationalPlayback = async () => ({ ...authorization, playbackUrl: "https://controlled.invalid/re-enabled.m3u8" });
  await denied.context.retry();
  assert.equal(denied.calls.find((c) => c.name === "setCurrentPlayback")?.value.stream_url, "https://controlled.invalid/re-enabled.m3u8", "re-enabled Retry binds a newly authorized URL");
  assert.equal(denied.calls.some((c) => c.name === "setPlayerGeneration"), true, "re-enabled Retry recovers the existing surface");
  assert.equal(denied.context.tvQueueRef.current, preservedQueue);
  assert.equal(denied.context.presentationModeRef.current, "floating");
  assert.equal(denied.context.currentItemRef.current.id, id);

  for (const changed of ["owner", "session", "request"]) {
    const stale = fixture();
    let finish!: (value: any) => void, notify!: () => void;
    const requested = new Promise<void>((resolve) => { notify = resolve; });
    stale.context.resolveIosOperationalPlayback = () => { notify(); return new Promise((resolve) => { finish = resolve; }); };
    const pending = stale.context.retry(); await requested;
    if (changed === "owner") stale.setOwner("shared-audio");
    if (changed === "session") stale.context.sessionIdRef.current++;
    if (changed === "request") stale.context.iosTvAuthorizationGenerationRef.current++;
    finish(authorization); await pending;
    assert.equal(stale.calls.length, 0, `${changed} change prevents stale retry from mutating a newer owner`);
  }

  for (const changed of ["session", "request"]) for (const allowed of [true, false]) {
    const stale = fixture();
    let finish!: () => void, reject!: (error: Error) => void, notify!: () => void;
    const requested = new Promise<void>((resolve) => { notify = resolve; });
    stale.context.assertIosOperationalContentAllowed = () => { notify(); return new Promise<void>((resolve, fail) => { finish = resolve; reject = fail; }); };
    const pending = stale.context.toggle(); await requested;
    // A replacement may retain the exact same canonical TV ID.
    if (changed === "session") stale.context.sessionIdRef.current++;
    else stale.context.iosTvAuthorizationGenerationRef.current++;
    if (allowed) finish(); else reject(new Error("old request denied"));
    await pending;
    assert.equal(stale.calls.length, 0, `late ${allowed ? "allow" : "deny"} cannot play/pause the newer same-ID ${changed}`);
  }

  const resume = fixture();
  assert.equal(await resume.context.resume(), false);
  const injected = resume.calls.find((c) => c.name === "inject")!.value;
  const messages: string[] = [];
  const frames = [{ src: "https://www.youtube.com/embed/Abcdef12345", contentWindow: { postMessage: (message: string) => messages.push(message) } }, { src: "https://www.youtube.com/embed/Zbcdef12345", contentWindow: { postMessage: () => { throw new Error("frame unavailable"); } } }];
  // Supported YouTube HTML intentionally has no window.togglePlayback function.
  runInNewContext(injected, { window: {}, document: { querySelectorAll: () => frames } });
  assert.ok(frames.every((frame) => frame.src === "about:blank"), "denial blanks YouTube even without a toggle API or working frame command");
  assert.equal(JSON.parse(messages[0]).func, "stopVideo");
  assert.equal(resume.calls.some((c) => c.name === "pause"), true);
  console.log("PASS iOS TV entry: Retry authorization/binding, denied cached remount, stale owner races, legacy/non-iOS path, YouTube stop");
}
void main();
