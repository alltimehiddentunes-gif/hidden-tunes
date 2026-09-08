import { filterIosOperationalItems, getIosOperationalPolicySnapshot, isIosOperationalItemVisible, refreshIosOperationalPolicy, IOS_OPERATIONAL_PLATFORM, iosOperationalRequestHeaders, isIos216PolicyTarget } from "./iosOperationalPolicy";
import { shouldIncludeMatureInApi } from "../utils/matureContentSettings";

export type IosMusicOptions = { page?: number; limit?: number; query?: string; artistId?: string; albumId?: string; genre?: string; forceRefresh?: boolean };
type Row = { id: string; [key: string]: unknown };
type Page = { items: Row[]; total: number; nextCursor: string | null; revision: number; enforcementEnabled: boolean; success: boolean; policyTarget?: unknown };
const BASE = "https://admin.hiddentunes.com";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let revision = -1;
let catalogMatureEnabled = false;
const cursors = new Map<string, Map<number, string | null>>();
let visibleRows: Row[] = [];
const completeCatalogs = new Map<string, { revision: number; at: number; rows: Row[] }>();
const completeInflight = new Map<string, Promise<Row[]>>();

export async function iosMusicIsControlled() {
  return IOS_OPERATIONAL_PLATFORM && (await refreshIosOperationalPolicy()).status !== "legacy";
}

/** The active catalog has its own revision-bound cache. Never overwrite the legacy catalog. */
export function iosMusicSnapshot(): Row[] | null {
  if (!IOS_OPERATIONAL_PLATFORM || getIosOperationalPolicySnapshot().status === "legacy") return null;
  if (getIosOperationalPolicySnapshot().revision !== revision || catalogMatureEnabled !== shouldIncludeMatureInApi()) return [];
  return visibleRows.filter((row) => isIosOperationalItemVisible({ type: "music", id: row.id }));
}

export function iosMusicNormalizerRow(row: Row) {
  // This URL reauthorizes the canonical record on the server, including Range requests.
  // Catalog responses never carry the origin asset URL.
  return { ...row, audio_url: `${BASE}/api/ios/media/music/${encodeURIComponent(row.id)}`, is_public: true };
}

async function readPage(params: URLSearchParams, expectedRevision: number): Promise<Page> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35000);
  try {
    const response = await fetch(`${BASE}/api/ios/catalog/music?${params}`, { headers: { Accept: "application/json", ...iosOperationalRequestHeaders() }, cache: "no-store", signal: controller.signal });
    if (response.status === 409) throw new Error("ios_policy_revision_changed");
    if (!response.ok) throw new Error("iOS music catalog unavailable");
    const data = await response.json() as Page;
    if (!data.success || !isIos216PolicyTarget(data.policyTarget) || !data.enforcementEnabled || data.revision !== expectedRevision || !Array.isArray(data.items) || !Number.isSafeInteger(data.total) || data.total < 0 || (data.nextCursor !== null && typeof data.nextCursor !== "string") || data.items.some((row) => !row || !UUID.test(row.id))) throw new Error("ios_policy_revision_changed");
    return data;
  } finally { clearTimeout(timer); }
}

export async function getIosMusicPage(options: IosMusicOptions = {}) {
  if (!await iosMusicIsControlled()) return null;
  const page = Math.max(1, Math.floor(Number(options.page) || 1));
  const limit = Math.min(100, Math.max(1, Math.floor(Number(options.limit) || 24)));
  for (let attempt = 0; attempt < 2; attempt++) {
    const snapshot = await refreshIosOperationalPolicy(attempt > 0 || Boolean(options.forceRefresh));
    if (snapshot.status === "legacy") return null;
    if (snapshot.status !== "active") throw new Error("iOS availability unavailable");
    const matureEnabled = shouldIncludeMatureInApi();
    if (revision !== snapshot.revision || catalogMatureEnabled !== matureEnabled) { revision = snapshot.revision; catalogMatureEnabled = matureEnabled; cursors.clear(); visibleRows = []; completeCatalogs.clear(); }
    const params = new URLSearchParams({ limit: String(limit) });
    if (matureEnabled) { params.set("mature_enabled", "true"); params.set("age_confirmed", "true"); }
    if (options.query) params.set("q", options.query.trim());
    for (const key of ["artistId", "albumId", "genre"] as const) if (options[key]) params.set(key, options[key]!.trim());
    const key = params.toString();
    if (options.forceRefresh) cursors.delete(key);
    const chain = cursors.get(key) ?? new Map<number, string | null>([[1, null]]);
    cursors.set(key, chain);
    try {
      let current = Math.max(...[...chain.keys()].filter((number) => number <= page));
      let result: Page;
      for (;;) {
        const cursor = chain.get(current);
        if (cursor) params.set("cursor", cursor); else params.delete("cursor");
        result = await readPage(params, snapshot.revision);
        if (current === page || !result.nextCursor) break;
        chain.set(++current, result.nextCursor);
      }
      if (current < page) result = { ...result, items: [], nextCursor: null };
      if (result.nextCursor) chain.set(page + 1, result.nextCursor);
      const admitted = await filterIosOperationalItems(result.items, (row) => ({ type: "music", id: row.id }), { matureEnabled });
      const latest = getIosOperationalPolicySnapshot();
      if (latest.status !== "active" || latest.revision !== snapshot.revision || shouldIncludeMatureInApi() !== matureEnabled) throw new Error("ios_policy_revision_changed");
      const merged = new Map(visibleRows.map((row) => [row.id, row]));
      for (const row of admitted) merged.set(row.id, row);
      visibleRows = [...merged.values()];
      return { items: admitted, total: result.total, page, limit, hasMore: Boolean(result.nextCursor), nextPage: page + 1, revision: snapshot.revision };
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "ios_policy_revision_changed" || attempt > 0) throw error;
      cursors.clear(); visibleRows = [];
    }
  }
  throw new Error("iOS music catalog changed");
}

export async function getAllIosMusic(options: Omit<IosMusicOptions, "page" | "limit"> = {}) {
  if (!await iosMusicIsControlled()) return null;
  const snapshot = getIosOperationalPolicySnapshot();
  if (snapshot.status !== "active") throw new Error("iOS availability unavailable");
  const matureEnabled = shouldIncludeMatureInApi();
  const key = JSON.stringify([snapshot.revision, matureEnabled, options.query || "", options.artistId || "", options.albumId || "", options.genre || ""]);
  const currentRows = (rows: Row[]) => {
    const latest = getIosOperationalPolicySnapshot();
    if (latest.status !== "active" || latest.revision !== snapshot.revision || shouldIncludeMatureInApi() !== matureEnabled) throw new Error("iOS policy changed during catalog load");
    return rows.filter((row) => isIosOperationalItemVisible({ type: "music", id: row.id }));
  };
  const cached = completeCatalogs.get(key);
  if (!options.forceRefresh && cached && cached.revision === snapshot.revision && Date.now() - cached.at < 15000) return currentRows(cached.rows);
  if (!options.forceRefresh && completeInflight.has(key)) return currentRows(await completeInflight.get(key)!);
  const run = async (): Promise<Row[]> => {
  const all: Row[] = [];
  let expectedRevision: number | undefined;
  for (let page = 1; ; page++) {
    const result = await getIosMusicPage({ ...options, forceRefresh: options.forceRefresh && page === 1, page, limit: 100 });
    if (!result) throw new Error("iOS policy changed during catalog load");
    if (result.revision !== snapshot.revision || shouldIncludeMatureInApi() !== matureEnabled) throw new Error("iOS policy changed during catalog load");
    if (expectedRevision !== undefined && result.revision !== expectedRevision) throw new Error("iOS policy changed during catalog load");
    expectedRevision = result.revision;
    all.push(...result.items);
    if (!result.hasMore) { const current = currentRows(all); completeCatalogs.set(key, { revision: result.revision, at: Date.now(), rows: current }); return current; }
  }
  };
  const pending = run().finally(() => { if (completeInflight.get(key) === pending) completeInflight.delete(key); });
  completeInflight.set(key, pending);
  return currentRows(await pending);
}
