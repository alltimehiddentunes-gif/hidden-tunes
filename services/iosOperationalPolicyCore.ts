/** Operational availability only. Never interprets documentary rights or projection flags. */
import { isIos216PolicyTarget, IOS_216_POLICY_TARGET } from "./iosOperationalIdentity";
export type IosOperationalSection = "music" | "radio" | "tv" | "podcasts" | "audiobooks" | "lectures" | "motivationals" | "sports";
export type IosOperationalRef = { type: string; id: string };
export type IosOperationalPolicy = {
  version: 1; revision: number; enforcementEnabled: boolean; profileActive?: boolean; mode?: "legacy" | "active";
  policyTarget: typeof IOS_216_POLICY_TARGET;
  controls: { id: string; parentId: string | null; enabled: boolean }[];
};
export type IosOperationalSnapshot = { status: "loading" | "legacy" | "active" | "unavailable"; revision: number; policy: IosOperationalPolicy | null; generation: number };
export type IosOperationalAccess = { matureEnabled?: boolean; assetId?: string };
export type IosOperationalDelivery = "controlled_media" | "direct" | "embed" | "external";
export type IosOperationalPlayback = { enforced: false } | { enforced: true; playbackUrl: string; revision: number; delivery: IosOperationalDelivery };
type ResponseLike = { ok: boolean; status: number; json(): Promise<unknown> };
export type IosOperationalDeps = {
  platform: string;
  identity?: unknown;
  request(path: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<ResponseLike>;
  read(): Promise<string | null>; write(value: string): Promise<void>; now(): number;
};
const refKey = (ref: IosOperationalRef) => `${ref.type}:${ref.id}`;
const ageQuery = (access: IosOperationalAccess = {}) => access.matureEnabled ? "mature_enabled=true&age_confirmed=true" : "";
function samePolicy(left: IosOperationalPolicy | null, right: IosOperationalPolicy): boolean {
  if (!left || left.version !== right.version || left.revision !== right.revision ||
      left.enforcementEnabled !== right.enforcementEnabled || left.profileActive !== right.profileActive ||
      left.mode !== right.mode || left.controls.length !== right.controls.length) return false;
  const controls = new Map(left.controls.map((control) => [control.id, control]));
  return right.controls.every((control) => {
    const previous = controls.get(control.id);
    return previous?.enabled === control.enabled && previous.parentId === control.parentId;
  });
}
export class IosOperationalUnavailableError extends Error {
  constructor() { super("This content is currently unavailable on iOS."); this.name = "IosOperationalUnavailableError"; }
}

/** Dependency injection keeps tests offline and non-iOS paths free of storage/network work. */
export class IosOperationalPolicyClient {
  private snapshot: IosOperationalSnapshot;
  private listeners = new Set<() => void>();
  private decisions = new Map<string, boolean>();
  private hydrated: Promise<void> | null = null;
  private inFlight: Promise<IosOperationalSnapshot> | null = null;
  private activated = false;
  private minimumRevision = -1;
  private acceptedLegacyRevision = -1;
  private lastRefresh = -Infinity;
  private readonly controlled: boolean;
  constructor(private readonly deps: IosOperationalDeps) {
    this.controlled = deps.platform === "ios" && isIos216PolicyTarget(deps.identity);
    this.snapshot = { status: this.controlled ? "loading" : "legacy", revision: -1, policy: null, generation: 0 };
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { if (!this.controlled) return () => {}; this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(status: IosOperationalSnapshot["status"], policy: IosOperationalPolicy | null = this.snapshot.policy) {
    this.snapshot = { status, policy, revision: policy?.revision ?? this.minimumRevision, generation: this.snapshot.generation + 1 };
    for (const listener of this.listeners) listener();
  }
  private hydrate() {
    if (!this.hydrated) this.hydrated = (async () => {
      try {
        const raw = await this.deps.read();
        if (!raw) return;
        const saved = JSON.parse(raw);
        if (saved.version !== 1 || !isIos216PolicyTarget(saved.policyTarget) || typeof saved.activated !== "boolean" || !Number.isSafeInteger(saved.revision)) throw new Error("Invalid saved policy state");
        this.activated = saved.activated;
        this.minimumRevision = saved.revision;
        this.acceptedLegacyRevision = Number.isSafeInteger(saved.acceptedLegacyRevision) ? saved.acceptedLegacyRevision : -1;
      } catch {
        // An unreadable marker cannot prove this device never observed activation.
        this.activated = true;
      }
    })();
    return this.hydrated;
  }
  private parsePolicy(raw: unknown): IosOperationalPolicy {
    const p = raw as IosOperationalPolicy;
    if (!p || p.version !== 1 || !isIos216PolicyTarget(p.policyTarget) || !Number.isSafeInteger(p.revision) || p.revision < 0 || typeof p.enforcementEnabled !== "boolean" || !Array.isArray(p.controls)) throw new Error("Invalid policy");
    if (p.enforcementEnabled ? (p.profileActive !== true || p.mode !== "active") : (p.profileActive !== false || p.mode !== "legacy")) throw new Error("Invalid activation state");
    const ids = new Set<string>();
    for (const c of p.controls) {
      if (!c || typeof c.id !== "string" || !c.id || ids.has(c.id) || typeof c.enabled !== "boolean" || (c.parentId !== null && typeof c.parentId !== "string")) throw new Error("Invalid controls");
      ids.add(c.id);
    }
    if (p.enforcementEnabled && !ids.has("ios")) throw new Error("Missing master");
    return p;
  }
  refresh = async (force = false): Promise<IosOperationalSnapshot> => {
    if (!this.controlled) return this.snapshot;
    if (this.inFlight) return this.inFlight;
    if (!force && this.snapshot.status !== "loading" && this.deps.now() - this.lastRefresh < 15000) return this.snapshot;
    this.inFlight = (async () => {
      await this.hydrate();
      // Exact216 starts closed until its server explicitly returns a valid target
      // policy. Older/future builds never enter this path or read this storage.
      try {
        const response = await this.deps.request("/api/ios/policy");
        if (!response.ok) throw new Error("Policy request failed");
        const policy = this.parsePolicy(await response.json());
        if (policy.revision < this.minimumRevision) throw new Error("Stale policy");
        if (this.activated && !policy.enforcementEnabled && !(policy.profileActive === false && policy.mode === "legacy" && (policy.revision > this.minimumRevision || policy.revision === this.acceptedLegacyRevision))) {
          // A rollout error/old server must not turn an observed active profile into legacy.
          throw new Error("Unexpected policy downgrade");
        }
        this.activated ||= policy.enforcementEnabled;
        this.acceptedLegacyRevision = this.activated && !policy.enforcementEnabled ? policy.revision : -1;
        this.minimumRevision = policy.revision;
        await this.deps.write(JSON.stringify({ version: 1, policyTarget: IOS_216_POLICY_TARGET, activated: this.activated, revision: this.minimumRevision, acceptedLegacyRevision: this.acceptedLegacyRevision }));
        const status = policy.enforcementEnabled ? "active" : "legacy";
        // A successful refresh with identical controls is not a catalog change.
        // Preserve the snapshot reference so subscribed rows do not rerender.
        if (this.snapshot.status !== status || !samePolicy(this.snapshot.policy, policy)) {
          this.decisions.clear();
          this.publish(status, policy);
        }
      } catch {
        this.decisions.clear();
        this.publish("unavailable", null);
      }
      this.lastRefresh = this.deps.now();
      return this.snapshot;
    })().finally(() => { this.inFlight = null; });
    return this.inFlight;
  };
  sectionEnabled = (section: IosOperationalSection | "mature") => {
    if (this.snapshot.status === "legacy") return true;
    if (this.snapshot.status !== "active" || !this.snapshot.policy) return false;
    return this.controlEnabled(section === "mature" ? "mature" : `section:${section}`);
  };
  controlEnabled = (id: string) => {
    if (this.snapshot.status === "legacy") return true;
    if (this.snapshot.status !== "active" || !this.snapshot.policy) return false;
    let current: string | null = id;
    const seen = new Set<string>();
    while (current) {
      if (seen.has(current)) return false;
      seen.add(current);
      const control = this.snapshot.policy.controls.find((c) => c.id === current);
      if (!control || !control.enabled) return false;
      current = control.parentId;
    }
    return true;
  };
  itemVisible = (ref: IosOperationalRef | null | undefined) => this.snapshot.status === "legacy" || (this.snapshot.status === "active" && !!ref && this.decisions.get(refKey(ref)) === true);
  private async resolve(refs: IosOperationalRef[], purpose: "discovery" | "playback", access: IosOperationalAccess, retry = true): Promise<Map<string, boolean>> {
    await this.refresh();
    if (this.snapshot.status === "legacy") return new Map(refs.map((r) => [refKey(r), true]));
    if (this.snapshot.status !== "active") throw new IosOperationalUnavailableError();
    const revision = this.snapshot.revision;
    const result = new Map<string, boolean>();
    const unique = [...new Map(refs.map((r) => [refKey(r), r])).values()];
    try {
      for (let start = 0; start < unique.length; start += 200) {
        const batch = unique.slice(start, start + 200);
        const query = ageQuery(access);
        const response = await this.deps.request(`/api/ios/resolve${query ? `?${query}` : ""}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: batch, purpose }) });
        if (response.status === 409) {
          if (!retry) throw new IosOperationalUnavailableError();
          await this.refresh(true);
          return this.resolve(refs, purpose, access, false);
        }
        if (!response.ok) throw new IosOperationalUnavailableError();
        const body = await response.json() as { success?: boolean; policyTarget?: unknown; enforcementEnabled?: boolean; revision?: number; items?: (IosOperationalRef & { allowed: boolean })[] };
        if (!body.success || !isIos216PolicyTarget(body.policyTarget) || body.enforcementEnabled !== true || body.revision !== revision || this.snapshot.revision !== revision || this.snapshot.status !== "active" || !Array.isArray(body.items)) {
          if (retry) { await this.refresh(true); return this.resolve(refs, purpose, access, false); }
          throw new IosOperationalUnavailableError();
        }
        for (const ref of batch) result.set(refKey(ref), body.items.some((item) => refKey(item) === refKey(ref) && item.allowed === true));
      }
      if (purpose === "discovery") {
        for (const [key, allowed] of result) this.decisions.set(key, allowed);
        this.publish("active");
      }
      return result;
    } catch {
      for (const ref of refs) this.decisions.delete(refKey(ref));
      this.publish(this.snapshot.status);
      throw new IosOperationalUnavailableError();
    }
  }
  filter = async <T>(items: T[], ref: (item: T) => IosOperationalRef | null | undefined, access: IosOperationalAccess = {}): Promise<T[]> => {
    if (!this.controlled) return items;
    await this.refresh();
    if (this.snapshot.status === "legacy") return items;
    const pairs = items.map((item) => ({ item, ref: ref(item) }));
    try {
      const decisions = await this.resolve(pairs.flatMap((p) => p.ref ? [p.ref] : []), "discovery", access);
      return pairs.filter((p) => p.ref && decisions.get(refKey(p.ref)) === true).map((p) => p.item);
    } catch { return []; }
  };
  assertAllowed = async (ref: IosOperationalRef | null, access: IosOperationalAccess = {}) => {
    if (!this.controlled) return;
    await this.refresh();
    if (this.snapshot.status === "legacy") return;
    if (!ref || !(await this.resolve([ref], "playback", access)).get(refKey(ref))) throw new IosOperationalUnavailableError();
  };
  playback = async (ref: IosOperationalRef | null, access: IosOperationalAccess = {}, retry = true): Promise<IosOperationalPlayback> => {
    if (!this.controlled) return { enforced: false };
    // Active playback is always authorized by the fresh endpoint below. Reuse the
    // short policy snapshot so legacy playback does not acquire a request per tap.
    await this.refresh();
    if (this.snapshot.status === "legacy") return { enforced: false };
    if (this.snapshot.status !== "active" || !ref) throw new IosOperationalUnavailableError();
    const revision = this.snapshot.revision;
    const query = new URLSearchParams(ageQuery(access));
    if (access.assetId) query.set("assetId", access.assetId);
    const queryString = query.toString();
    const response = await this.deps.request(`/api/ios/playback/${encodeURIComponent(ref.type)}/${encodeURIComponent(ref.id)}${queryString ? `?${queryString}` : ""}`);
    if (response.status === 409 && retry) { await this.refresh(true); return this.playback(ref, access, false); }
    if (!response.ok) throw new IosOperationalUnavailableError();
    const body = await response.json() as { success?: boolean; policyTarget?: unknown; allowed?: boolean; enforcementEnabled?: boolean; revision?: number; type?: string; id?: string; playbackUrl?: string; delivery?: IosOperationalDelivery };
    if (body.revision !== revision && retry) { await this.refresh(true); return this.playback(ref, access, false); }
    if (!body.success || !body.allowed || !isIos216PolicyTarget(body.policyTarget) || body.enforcementEnabled !== true || body.revision !== revision || this.snapshot.revision !== revision || this.snapshot.status !== "active" || body.type !== ref.type || body.id !== ref.id || !/^https:\/\//i.test(body.playbackUrl || "") || !["controlled_media", "direct", "embed", "external"].includes(body.delivery || "")) throw new IosOperationalUnavailableError();
    return { enforced: true, playbackUrl: body.playbackUrl!, revision, delivery: body.delivery! };
  };
}
