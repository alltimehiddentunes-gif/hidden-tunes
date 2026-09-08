import assert from "node:assert/strict";
import { IosOperationalPolicyClient, type IosOperationalPolicy } from "../services/iosOperationalPolicyCore";

const mureka = "00000000-0000-4000-8000-000000000001";
const djcity = "00000000-0000-4000-8000-000000000002";
function fixture(platform = "ios") {
  let revision = 1, active = false, offline = false, stored: string | null = null, now = 0;
  const enabled: Record<string, boolean> = { ios: true, "section:music": true, "section:tv": true, "source:music:mureka": true, "source:music:djcity": true };
  const calls: { path: string; count?: number }[] = [];
  const policy = (): IosOperationalPolicy => ({ version: 1, revision, enforcementEnabled: active, profileActive: active, mode: active ? "active" : "legacy", controls: Object.entries(enabled).map(([id, value]) => ({ id, enabled: value, parentId: id === "ios" ? null : id.startsWith("source:") ? "section:music" : "ios" })) });
  const allowed = (id: string, type: string) => enabled.ios && enabled[type === "tv" ? "section:tv" : "section:music"] && (type === "tv" || enabled[id === djcity ? "source:music:djcity" : "source:music:mureka"]);
  const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
  const client = new IosOperationalPolicyClient({ platform, now: () => now, read: async () => stored, write: async (value) => { stored = value; }, request: async (path, init) => {
    if (offline) throw new Error("offline");
    if (path === "/api/ios/policy") { calls.push({ path }); return response(policy()); }
    if (path.startsWith("/api/ios/resolve")) {
      const { items } = JSON.parse(init!.body!); calls.push({ path, count: items.length });
      return response({ success: true, revision, enforcementEnabled: active, items: items.map((item: { id: string; type: string }) => ({ ...item, allowed: allowed(item.id, item.type) })) });
    }
    const [type, id] = path.split("?")[0].split("/").slice(-2);
    calls.push({ path });
    return response({ success: allowed(id, type), allowed: allowed(id, type), enforcementEnabled: active, revision, type, id, playbackUrl: `https://controlled.invalid/${type}/${id}`, delivery: type === "music" ? "controlled_media" : "direct" }, allowed(id, type) ? 200 : 403);
  } });
  return { client, calls, activate() { active = true; revision++; now += 20000; }, deactivate() { active = false; revision++; now += 20000; }, set(id: string, value: boolean) { enabled[id] = value; revision++; now += 20000; }, offline() { offline = true; now += 20000; }, policy, saved: () => stored };
}

async function main() {
  for (const remembered of [false, true]) {
    let finishRead!: (value: string | null) => void;
    let finishRequest!: (value: { ok: boolean; status: number; json(): Promise<unknown> }) => void;
    let notifyRequested!: () => void;
    const requested = new Promise<void>((resolve) => { notifyRequested = resolve; });
    const cold = new IosOperationalPolicyClient({ platform: "ios", now: Date.now, read: () => new Promise((resolve) => { finishRead = resolve; }), write: async () => {}, request: () => { notifyRequested(); return new Promise((resolve) => { finishRequest = resolve; }); } });
    const refreshing = cold.refresh();
    assert.equal(cold.itemVisible({ type: "music", id: mureka }), false, "no legacy verdict before marker hydration");
    finishRead(remembered ? JSON.stringify({ version: 1, activated: true, revision: 1 }) : null);
    await requested;
    assert.equal(cold.itemVisible({ type: "music", id: mureka }), !remembered, "only proven never-active cache is visible while policy network is pending");
    finishRequest({ ok: false, status: 503, json: async () => ({}) });
    assert.equal((await refreshing).status, remembered ? "unavailable" : "legacy");
  }
  for (const platform of ["android", "web", "windows", "macos", "linux", "amazon-fire"]) {
    const f = fixture(platform), input = [{ id: djcity }];
    assert.equal(await f.client.filter(input, (x) => ({ type: "music", id: x.id })), input);
    assert.deepEqual(await f.client.playback({ type: "music", id: djcity }), { enforced: false });
    assert.equal(f.calls.length, 0); assert.equal(f.saved(), null);
  }
  const f = fixture();
  const songs = [{ id: mureka }, { id: djcity }];
  assert.equal(await f.client.filter(songs, (x) => ({ type: "music", id: x.id })), songs, "inactive is exact legacy passthrough");
  f.activate(); await f.client.refresh(true);
  assert.equal(f.client.itemVisible({ type: "music", id: mureka }), false, "active unverified cached objects hidden");
  assert.equal((await f.client.filter(songs, (x) => ({ type: "music", id: x.id }))).length, 2, "A: both sources allowed");
  const initial = await f.client.playback({ type: "music", id: djcity });
  assert.ok(initial.enforced && initial.playbackUrl === `https://controlled.invalid/music/${djcity}`);
  assert.ok(initial.enforced && initial.delivery === "controlled_media");
  f.set("source:music:djcity", false); await f.client.refresh(true);
  assert.equal(f.client.itemVisible({ type: "music", id: mureka }), false, "new revision invalidates all old decisions");
  assert.deepEqual(await f.client.filter(songs, (x) => ({ type: "music", id: x.id })), [{ id: mureka }], "B: source isolation");
  await assert.rejects(f.client.playback({ type: "music", id: djcity }), "cached DJcity URL cannot bypass reauthorization");
  f.set("source:music:djcity", true); f.set("source:music:mureka", false);
  assert.deepEqual(await f.client.filter(songs, (x) => ({ type: "music", id: x.id })), [{ id: djcity }], "C: reverse source isolation");
  f.set("section:music", false);
  assert.deepEqual(await f.client.filter(songs, (x) => ({ type: "music", id: x.id })), [], "D: music off");
  await assert.rejects(f.client.playback({ type: "music", id: djcity }));
  f.set("section:tv", false); await assert.rejects(f.client.playback({ type: "tv", id: mureka }), "E: TV direct ID off");
  f.set("ios", false); await f.client.refresh(true);
  assert.equal(f.client.sectionEnabled("music"), false, "F: master off");
  assert.equal(f.client.sectionEnabled("tv"), false);
  assert.equal(songs.length, 2, "queue/library input unchanged");
  f.offline(); await f.client.refresh(true);
  assert.equal(f.client.getSnapshot().status, "unavailable");
  assert.deepEqual(await f.client.filter(songs, (x) => ({ type: "music", id: x.id })), []);
  await assert.rejects(f.client.playback({ type: "music", id: mureka }));
  assert.ok(JSON.parse(f.saved()!).activated, "activation persisted before use");

  const batch = fixture(); batch.activate();
  const many = Array.from({ length: 401 }, (_, n) => ({ id: `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}` }));
  assert.equal((await batch.client.filter(many, (x) => ({ type: "music", id: x.id }))).length, 401);
  assert.deepEqual(batch.calls.filter((c) => c.count).map((c) => c.count), [200, 200, 1]);

  const restart = new IosOperationalPolicyClient({ platform: "ios", now: Date.now, read: async () => f.saved(), write: async () => {}, request: async () => { throw new Error("offline"); } });
  assert.equal((await restart.refresh()).status, "unavailable", "restart hydrates activation before fallback verdict");
  const stale = new IosOperationalPolicyClient({ platform: "ios", now: Date.now, read: async () => f.saved(), write: async () => {}, request: async () => ({ ok: true, status: 200, json: async () => ({ ...batch.policy(), revision: 0 }) }) });
  assert.equal((await stale.refresh()).status, "unavailable", "stale server cannot erase remembered activation");
  const deactivated = fixture(); deactivated.activate(); await deactivated.client.refresh(true);
  deactivated.deactivate(); assert.equal((await deactivated.client.refresh(true)).status, "legacy");
  assert.equal((await deactivated.client.refresh(true)).status, "legacy", "same accepted deactivation revision remains valid");
  const deactivatedRestart = new IosOperationalPolicyClient({ platform: "ios", now: Date.now, read: async () => deactivated.saved(), write: async () => {}, request: async () => ({ ok: true, status: 200, json: async () => deactivated.policy() }) });
  assert.equal((await deactivatedRestart.refresh()).status, "legacy", "persisted explicit deactivation permits fresh equal-revision policy");

  let raceRevision = 1, resolveAttempts = 0;
  const racePolicy = () => ({ ...batch.policy(), revision: raceRevision });
  const raceClient = new IosOperationalPolicyClient({ platform: "ios", now: Date.now, read: async () => null, write: async () => {}, request: async (path, init) => {
    if (path === "/api/ios/policy") return { ok: true, status: 200, json: async () => racePolicy() };
    resolveAttempts++;
    if (resolveAttempts === 1) { raceRevision++; return { ok: false, status: 409, json: async () => ({}) }; }
    return { ok: true, status: 200, json: async () => ({ success: true, revision: raceRevision, enforcementEnabled: true, items: JSON.parse(init!.body!).items.map((ref: object) => ({ ...ref, allowed: true })) }) };
  } });
  assert.equal((await raceClient.filter(songs, (x) => ({ type: "music", id: x.id }))).length, 2);
  assert.equal(resolveAttempts, 2, "one retry refreshes a racing revision");
  let rejectedAttempts = 0;
  const alwaysRacing = new IosOperationalPolicyClient({ platform: "ios", now: Date.now, read: async () => null, write: async () => {}, request: async (path) => path === "/api/ios/policy" ? { ok: true, status: 200, json: async () => racePolicy() } : (++rejectedAttempts, { ok: false, status: 409, json: async () => ({}) }) });
  assert.deepEqual(await alwaysRacing.filter(songs, (x) => ({ type: "music", id: x.id })), []);
  assert.equal(rejectedAttempts, 2, "repeat revision races fail closed without unbounded requests");
  for (const delivery of ["embed", "external", "direct", "unexpected", undefined]) {
    const delivered = new IosOperationalPolicyClient({ platform: "ios", now: Date.now, read: async () => null, write: async () => {}, request: async (path) => ({ ok: true, status: 200, json: async () => path === "/api/ios/policy" ? racePolicy() : ({ success: true, allowed: true, revision: raceRevision, enforcementEnabled: true, type: "tv", id: mureka, playbackUrl: "https://controlled.invalid/embed", delivery }) }) });
    if (delivery === "unexpected" || delivery === undefined) await assert.rejects(delivered.playback({ type: "tv", id: mureka }));
    else { const result = await delivered.playback({ type: "tv", id: mureka }); assert.ok(result.enforced && result.delivery === delivery); }
  }
  for (const purpose of ["discovery", "playback"]) {
    let online = true;
    let release!: () => void;
    let requested!: () => void;
    const started = new Promise<void>((resolve) => { requested = resolve; });
    const interrupted = new IosOperationalPolicyClient({ platform: "ios", now: Date.now, read: async () => null, write: async () => {}, request: async (path) => {
      if (path === "/api/ios/policy") return { ok: online, status: online ? 200 : 503, json: async () => racePolicy() };
      requested(); await new Promise<void>((resolve) => { release = resolve; });
      return { ok: true, status: 200, json: async () => ({ success: true, allowed: true, revision: raceRevision, enforcementEnabled: true, items: [{ type: "music", id: mureka, allowed: true }], type: "music", id: mureka, playbackUrl: "https://controlled.invalid/music", delivery: "controlled_media" }) };
    } });
    await interrupted.refresh();
    const pending = purpose === "discovery" ? interrupted.filter([{ id: mureka }], (x) => ({ type: "music", id: x.id })) : interrupted.playback({ type: "music", id: mureka });
    await started; online = false; await interrupted.refresh(true); release();
    if (purpose === "discovery") assert.deepEqual(await pending, []);
    else await assert.rejects(pending);
    assert.equal(interrupted.getSnapshot().status, "unavailable", "in-flight success cannot restore active state after policy availability was lost");
  }
  console.log("PASS iOS operational client: legacy, A–F, source isolation, controlled URL, cached/queue/direct-ID denial, persistence/offline/stale, batch bounds, non-iOS isolation");
}
void main();
