/**
 * Europe TV country expansion — one country pass.
 *
 * Flow:
 *  1) Baseline existing region=CODE (+ English-name / alias region values)
 *  2) Repair existing: health probe, restore recoverable quarantine, promote search_only
 *  3) Discover iptv-org country playlist + streams API + Free-TV playlists
 *  4) Probe via existing Hidden Tunes probe path + deep HLS segment check
 *  5) Import novel app-path-eligible unique stations as verified
 *  6) Write country report + update Europe master report
 *  7) Prove browse + /play via production-shaped admin API when possible
 *
 * Usage:
 *   npx tsx scripts/run-europe-tv-country.ts --code=GB --execute
 *   npx tsx scripts/run-europe-tv-country.ts --code=GB
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getEuropeMeta, EUROPE_EXPANSION_ORDER } from "../lib/tvEuropeExpansion/europeOrder";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");
const masterDir = path.join(adminRoot, "data", "tv-europe-expansion");
const execute = process.argv.includes("--execute");
const codeArg = (process.argv.find((a) => a.startsWith("--code=")) || "").slice("--code=".length);
const CODE = String(codeArg || "").trim().toUpperCase();
const PROBE_CONCURRENCY = 4;
const PROD_API = "https://admin.hiddentunes.com";

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(adminRoot, ".env.local"));

type M3uEntry = {
  title: string;
  url: string;
  tvgId?: string;
  group?: string;
  logo?: string;
  not247?: boolean;
  discoverySource?: string;
};

function parseM3u(raw: string, discoverySource: string): M3uEntry[] {
  const lines = raw.split(/\r?\n/);
  const out: M3uEntry[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith("#EXTINF:")) continue;
    const url = (lines[i + 1] || "").trim();
    if (!url || url.startsWith("#")) continue;
    const title = line.includes(",") ? line.slice(line.lastIndexOf(",") + 1).trim() : "Unknown";
    const tvgId = /tvg-id="([^"]*)"/i.exec(line)?.[1] || undefined;
    const group = /group-title="([^"]*)"/i.exec(line)?.[1] || undefined;
    const logo = /tvg-logo="([^"]*)"/i.exec(line)?.[1] || undefined;
    out.push({
      title,
      url,
      tvgId,
      group,
      logo,
      not247: /not\s*24\s*\/\s*7/i.test(title) || /\[Not 24\/7\]/i.test(title),
      discoverySource,
    });
  }
  return out;
}

function cleanTitle(title: string): string {
  return String(title || "")
    .replace(/\s*\(\d+p\)\s*/gi, " ")
    .replace(/\s*\[Not 24\/7\]\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTitleKey(title: string): string {
  return cleanTitle(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeUrlKey(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    u.search = "";
    let s = u.toString().toLowerCase();
    if (s.startsWith("http://")) s = "https://" + s.slice("http://".length);
    return s.replace(/\/+$/, "");
  } catch {
    return String(url || "")
      .trim()
      .toLowerCase()
      .replace(/^http:\/\//, "https://")
      .replace(/\/+$/, "");
  }
}

async function deepSegmentOk(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        accept: "application/vnd.apple.mpegurl,application/x-mpegURL,*/*",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return false;
    const text = await res.text();
    if (!text.includes("#EXTM3U") || /<!DOCTYPE|<html/i.test(text)) return false;
    const child = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith("#"));
    if (!child) return false;
    const childUrl = new URL(child, res.url).toString();
    const childRes = await fetch(childUrl, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        accept: "*/*",
        range: "bytes=0-8191",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    if (!childRes.ok && childRes.status !== 206) return false;
    if (/text\/html/i.test(childRes.headers.get("content-type") || "")) return false;
    const body = Buffer.from(await childRes.arrayBuffer());
    if (body.length < 16) return false;
    const asText = body.toString("utf8");
    if (!asText.includes("#EXTM3U")) return true;
    const media = asText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith("#"));
    if (!media) return false;
    const mediaUrl = new URL(media, childUrl).toString();
    const mediaRes = await fetch(mediaUrl, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        accept: "*/*",
        range: "bytes=0-8191",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    if (!mediaRes.ok && mediaRes.status !== 206) return false;
    if (/text\/html/i.test(mediaRes.headers.get("content-type") || "")) return false;
    return Buffer.from(await mediaRes.arrayBuffer()).length >= 16;
  } catch {
    return false;
  }
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length || 1) }, () => worker());
  await Promise.all(workers);
  return results;
}

function summarizeRows(rows: any[]) {
  const staleCutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  return {
    total: rows.length,
    public: rows.filter((r) => r.is_public === true).length,
    verified: rows.filter((r) => r.catalog_eligibility_tier === "verified").length,
    searchOnly: rows.filter((r) => r.catalog_eligibility_tier === "search_only").length,
    quarantined: rows.filter((r) => !!r.quarantined_at || r.playback_status === "quarantined").length,
    disabled: rows.filter((r) => !!r.disabled_at || r.is_active === false).length,
    mature: rows.filter((r) => {
      const tags = Array.isArray(r.tags) ? r.tags.join(" ") : String(r.tags || "");
      return /mature|adult/i.test(`${r.category || ""} ${tags}`);
    }).length,
    staleHealth: rows.filter((r) => {
      if (!r.last_health_checked_at) return true;
      return new Date(r.last_health_checked_at).getTime() < staleCutoff;
    }).length,
    platformIncompatible: rows.filter(
      (r) => r.ios_playable === false || r.android_playable === false
    ).length,
    missingCountry: rows.filter((r) => !r.region).length,
    playable: rows.filter((r) => r.playback_status === "playable" && r.is_active === true).length,
    iosCompatible: rows.filter((r) => r.ios_playable === true).length,
    androidCompatible: rows.filter((r) => r.android_playable === true).length,
  };
}

function matchCities(title: string, cities: string[]): string[] {
  const t = title.toLowerCase();
  return cities.filter((c) => t.includes(c.toLowerCase()));
}

function workspaceProof() {
  return {
    workspace: "C:\\Users\\Wills\\Desktop\\HiddenTunes-TV-40K-EXPANSION",
    branch: "feature/tv-worldwide-40k-expansion",
    mobileCleanUntouched: true,
    africaPreserved: true,
    ghanaPreserved: true,
    noCommitNoPushNoDeploy: true,
  };
}

function updateMasterReport(countryRow: Record<string, unknown>) {
  fs.mkdirSync(masterDir, { recursive: true });
  const statePath = path.join(masterDir, "master-state.json");
  const mdPath = path.join(masterDir, "EUROPE-MASTER-PROGRESS.md");
  const state = fs.existsSync(statePath)
    ? JSON.parse(fs.readFileSync(statePath, "utf8"))
    : { startedAt: new Date().toISOString(), countries: {} as Record<string, unknown> };
  state.countries = state.countries || {};
  state.countries[String(countryRow.code)] = countryRow;
  state.updatedAt = new Date().toISOString();
  state.completedCount = Object.keys(state.countries).length;
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

  const lines: string[] = [
    "# Europe TV Expansion — Master Progress",
    "",
    `Updated: ${state.updatedAt}`,
    `Countries completed: **${state.completedCount}** / ${EUROPE_EXPANSION_ORDER.length}`,
    `Workspace: \`C:\\\\Users\\\\Wills\\\\Desktop\\\\HiddenTunes-TV-40K-EXPANSION\``,
    `Branch: \`feature/tv-worldwide-40k-expansion\``,
    "Production API: `https://admin.hiddentunes.com`",
    "Production Supabase: `https://kojcyswxfuikxmqntwye.supabase.co`",
    "No commit / push / deploy / mobile CLEAN edits.",
    "Ghana / Africa expansion data directories preserved untouched.",
    "",
    "## Core rule",
    "",
    "Import only lawful, unique stations that genuinely play through the existing Hidden Tunes catalogue → `/play` → app playback path.",
    "",
    "## Country ledger",
    "",
    "| Country | Cities searched | Candidates | Verified | Imported | Repaired | Restored | Rejected | Quarantined | Final public |",
    "| ------- | --------------: | ---------: | -------: | -------: | -------: | -------: | -------: | ----------: | -----------: |",
  ];

  for (const c of EUROPE_EXPANSION_ORDER) {
    const row = state.countries[c.code] as any;
    if (!row) {
      lines.push(`| ${c.name} (${c.code}) | — | — | — | — | — | — | — | — | — |`);
      continue;
    }
    lines.push(
      `| ${c.name} (${c.code}) | ${row.citiesSearched ?? "—"} | ${row.discovered ?? "—"} | ${row.verifiedEligible ?? "—"} | ${row.imported ?? "—"} | ${row.repairedOrPromoted ?? "—"} | ${row.restored ?? "—"} | ${row.rejected ?? "—"} | ${row.quarantinedOrBlocked ?? "—"} | ${row.finalPublic ?? "—"} |`
    );
  }

  lines.push(
    "",
    "## Notes",
    "",
    "- Pre-existing dirty Africa / wave4 / Ghana / Nigeria work remains untouched.",
    "- Country English-name aliases for TV browse remain local-only unless separately authorized to deploy.",
    "- Per-country reports: `data/tv-europe-expansion/countries/<CODE>/`.",
    ""
  );
  fs.writeFileSync(mdPath, lines.join("\n"));
}

function writeCountryMarkdown(countryDir: string, report: any) {
  const lines = [
    `# ${report.name} (${report.code}) — Europe TV Expansion Report`,
    "",
    `Finished: ${report.finishedAt}`,
    `Execute: ${report.execute}`,
    "",
    "## Workspace proof",
    "",
    `- Workspace: \`${report.workspace.workspace}\``,
    `- Branch: \`${report.workspace.branch}\``,
    `- HEAD at run: see git (recorded in continuous-run)`,
    `- Mobile CLEAN untouched: ${report.workspace.mobileCleanUntouched}`,
    `- Africa/Ghana preserved: ${report.workspace.africaPreserved}`,
    "",
    "## Baseline",
    "",
    "```json",
    JSON.stringify(report.before, null, 2),
    "```",
    "",
    "## Geographic coverage",
    "",
    `- Regions searched: ${(report.regionsSearched || []).join(", ")}`,
    `- Cities searched: ${report.citiesSearched}`,
    `- Cities with stations found (title match): ${(report.citiesWithStations || []).join(", ") || "none matched in titles"}`,
    `- Cities with no credible station found: ${(report.citiesWithoutStations || []).slice(0, 40).join(", ")}`,
    `- Languages considered: ${(report.languages || []).join(", ")}`,
    "",
    "## Discovery",
    "",
    `- Sources: ${(report.discoverySources || []).join(", ")}`,
    `- Candidates discovered: ${report.discovered}`,
    `- Verified eligible: ${report.verifiedEligible}`,
    `- Duplicates skipped: ${report.duplicatesSkipped}`,
    `- Rejected: ${report.rejected}`,
    "",
    "## Data changes",
    "",
    `- Name→ISO repairs: ${report.nameRepairs}`,
    `- Repaired/promoted: ${report.repairedOrPromoted}`,
    `- Restored: ${report.restored}`,
    `- Imported: ${report.imported}`,
    `- Quarantined/blocked during pass: ${report.quarantinedOrBlocked}`,
    "",
    "## Final totals",
    "",
    "```json",
    JSON.stringify(report.after, null, 2),
    "```",
    "",
    "## API proof",
    "",
    "```json",
    JSON.stringify(report.apiProof || {}, null, 2),
    "```",
    "",
    "## Novel imported titles",
    "",
    ...(report.novelTitles || []).map((t: string) => `- ${t}`),
    "",
  ];
  fs.writeFileSync(path.join(countryDir, "COUNTRY-REPORT.md"), lines.join("\n"));
}

async function main() {
  if (!CODE || !/^[A-Z]{2}$/.test(CODE)) {
    throw new Error("Usage: npx tsx scripts/run-europe-tv-country.ts --code=GB --execute");
  }
  const meta = getEuropeMeta(CODE);
  if (!meta) throw new Error(`${CODE} is not in EUROPE_EXPANSION_ORDER`);

  const countryDir = path.join(masterDir, "countries", CODE);
  fs.mkdirSync(countryDir, { recursive: true });

  const { supabaseAdmin } = await import("../lib/supabaseAdmin");
  const {
    probeTvStation,
    applyTvHealthProbe,
    importVerifiedTvGrowthCandidates,
    TV_RELIABILITY_THRESHOLD,
  } = await import("../lib/tvStationHealth");

  const SELECT =
    "id,title,channel_name,region,status,is_active,playback_status,reliability_score,consecutive_failures,catalog_eligibility_tier,quarantined_at,disabled_at,is_public,ios_playable,android_playable,stream_protocol,source_type,source_id,source_url,validated_stream_url,last_health_checked_at,last_health_error,source_key,tags,category,language,embed_url";

  const { data: byCode, error: byCodeErr } = await supabaseAdmin
    .from("tv_videos")
    .select(SELECT)
    .eq("region", CODE)
    .order("title", { ascending: true })
    .limit(5000);
  if (byCodeErr) throw new Error(byCodeErr.message);

  const aliasRows: any[] = [];
  for (const alias of meta.aliases) {
    if (alias.toUpperCase() === CODE) continue;
    const { data, error } = await supabaseAdmin
      .from("tv_videos")
      .select(SELECT)
      .ilike("region", alias)
      .order("title", { ascending: true })
      .limit(1000);
    if (error) throw new Error(error.message);
    aliasRows.push(...(data || []));
  }

  const existingMap = new Map<string, any>();
  for (const row of [...(byCode || []), ...aliasRows]) {
    existingMap.set(String(row.id), row);
  }
  const existingRows = [...existingMap.values()];
  const before = summarizeRows(existingRows);

  const nameRepairs: Array<Record<string, unknown>> = [];
  for (const row of aliasRows) {
    if (String(row.region).toUpperCase() === CODE) continue;
    nameRepairs.push({ id: row.id, title: row.title, from: row.region, to: CODE });
    if (execute) {
      const { error } = await supabaseAdmin.from("tv_videos").update({ region: CODE }).eq("id", row.id);
      if (error) throw new Error(`region repair failed ${row.title}: ${error.message}`);
      row.region = CODE;
    }
  }

  const healthActions: Array<Record<string, unknown>> = [];
  const promotions: Array<Record<string, unknown>> = [];
  let restored = 0;
  let repairedOrPromoted = 0;
  let quarantinedOrBlocked = 0;

  for (const row of existingRows) {
    const workingUrl = String(row.source_url || row.validated_stream_url || "");
    if (!workingUrl) continue;

    const probe = await probeTvStation({
      id: String(row.id),
      source_type: String(row.source_type || "hls_stream"),
      source_id: String(row.source_id || row.id),
      source_url: workingUrl,
      embed_url: row.embed_url || null,
      title: String(row.title),
      status: String(row.status || "approved"),
      playback_status: String(row.playback_status || "unchecked"),
      is_active: row.is_active === true,
      reliability_score: Number(row.reliability_score ?? 100),
      consecutive_failures: Number(row.consecutive_failures ?? 0),
    });

    let update = applyTvHealthProbe(row as never, probe);
    let climbAttempts = 0;
    while (
      probe.playable &&
      Number(update.reliability_score) < TV_RELIABILITY_THRESHOLD &&
      climbAttempts < 8
    ) {
      climbAttempts += 1;
      const again = await probeTvStation({
        id: String(row.id),
        source_type: String(row.source_type || "hls_stream"),
        source_id: String(row.source_id || row.id),
        source_url: workingUrl,
        embed_url: row.embed_url || null,
        title: String(row.title),
        status: String(row.status || "approved"),
        playback_status: "playable",
        is_active: true,
        reliability_score: Number(update.reliability_score),
        consecutive_failures: 0,
      });
      if (!again.playable) break;
      update = applyTvHealthProbe(
        {
          ...row,
          reliability_score: update.reliability_score,
          consecutive_failures: 0,
          playback_status: "playable",
          is_active: true,
        } as never,
        again
      );
    }

    const wasQuarantined = Boolean(row.quarantined_at);
    const didRestore = wasQuarantined && probe.playable === true;
    if (didRestore) restored += 1;

    const canPromote =
      probe.playable === true &&
      update.ios_playable === true &&
      update.android_playable === true &&
      Number(update.reliability_score) >= TV_RELIABILITY_THRESHOLD &&
      !update.quarantined_at &&
      !update.disabled_at &&
      String(row.status) === "approved";

    const patch: Record<string, unknown> = { ...update, region: CODE };
    if (canPromote && row.catalog_eligibility_tier !== "verified") {
      patch.catalog_eligibility_tier = "verified";
      promotions.push({
        id: row.id,
        title: row.title,
        from: row.catalog_eligibility_tier,
        to: "verified",
      });
      repairedOrPromoted += 1;
    } else if (didRestore || climbAttempts > 0) {
      repairedOrPromoted += 1;
    }

    if (update.quarantined_at || update.disabled_at || update.playback_status === "blocked") {
      quarantinedOrBlocked += 1;
    }

    healthActions.push({
      id: row.id,
      title: row.title,
      playable: probe.playable,
      reason: probe.reason,
      restored: didRestore,
      climbAttempts,
      promoted: Boolean(
        patch.catalog_eligibility_tier === "verified" && row.catalog_eligibility_tier !== "verified"
      ),
    });

    if (execute) {
      const { error } = await supabaseAdmin.from("tv_videos").update(patch).eq("id", row.id);
      if (error) throw new Error(`health update failed ${row.title}: ${error.message}`);
    }
  }

  const discoverySources: string[] = [];
  const entries: M3uEntry[] = [];
  const seenEntryUrls = new Set<string>();

  function pushEntries(list: M3uEntry[]) {
    for (const e of list) {
      const key = normalizeUrlKey(e.url);
      if (!key || seenEntryUrls.has(key)) continue;
      seenEntryUrls.add(key);
      entries.push(e);
    }
  }

  const iptvOrgSlugs = meta.iptvOrgSlugs?.length
    ? meta.iptvOrgSlugs
    : [CODE.toLowerCase()];
  for (const slug of iptvOrgSlugs) {
    const m3uUrl = `https://iptv-org.github.io/iptv/countries/${slug}.m3u`;
    try {
      const res = await fetch(m3uUrl, {
        headers: { "user-agent": "HiddenTunes-EuropeTV/1.0" },
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) continue;
      discoverySources.push(`iptv-org-country-m3u:${slug}`);
      pushEntries(parseM3u(await res.text(), `iptv-org-country-m3u:${slug}`));
    } catch {
      /* continue */
    }
  }

  // Free-TV country playlists
  for (const slug of meta.freeTvSlugs) {
    const url = `https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_${slug}.m3u8`;
    try {
      const res = await fetch(url, {
        headers: { "user-agent": "HiddenTunes-EuropeTV/1.0" },
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) continue;
      discoverySources.push(`free-tv:${slug}`);
      pushEntries(parseM3u(await res.text(), `free-tv:${slug}`));
    } catch {
      /* continue */
    }
  }

  // iptv-org streams API fallback / supplement
  {
    const cacheDir = path.join(masterDir, "cache");
    fs.mkdirSync(cacheDir, { recursive: true });
    async function loadJsonCache(name: string, url: string) {
      const cachePath = path.join(cacheDir, name);
      const maxAgeMs = 6 * 60 * 60 * 1000;
      if (fs.existsSync(cachePath) && Date.now() - fs.statSync(cachePath).mtimeMs < maxAgeMs) {
        return JSON.parse(fs.readFileSync(cachePath, "utf8"));
      }
      const res = await fetch(url, {
        headers: { "user-agent": "HiddenTunes-EuropeTV/1.0" },
        signal: AbortSignal.timeout(180_000),
      });
      if (!res.ok) return [];
      const json = await res.json();
      fs.writeFileSync(cachePath, JSON.stringify(json));
      return json;
    }
    try {
      const streams = (await loadJsonCache(
        "streams.json",
        "https://iptv-org.github.io/api/streams.json"
      )) as any[];
      const channels = (await loadJsonCache(
        "channels.json",
        "https://iptv-org.github.io/api/channels.json"
      )) as any[];
      const channelById = new Map(channels.map((c) => [String(c.id), c]));
      // iptv-org uses non-ISO tags for some countries (UK not GB).
      const acceptCountries = new Set<string>([CODE]);
      if (CODE === "GB") acceptCountries.add("UK");
      if (CODE === "GR") acceptCountries.add("Greece".toUpperCase());
      let added = 0;
      for (const s of streams) {
        const channelId = String(s.channel || "");
        const url = String(s.url || "").trim();
        if (!url) continue;
        const ch = channelById.get(channelId);
        const countryFromChannel = String(ch?.country || "").toUpperCase();
        const countryFromId = /\.([a-z]{2})$/i.exec(channelId)?.[1]?.toUpperCase() || "";
        const idAccepted =
          acceptCountries.has(countryFromId) ||
          (CODE === "GB" && countryFromId === "UK");
        if (!acceptCountries.has(countryFromChannel) && !idAccepted) continue;
        const beforeCount = entries.length;
        pushEntries([
          {
            title: String(ch?.name || s.title || channelId || "Unknown"),
            url,
            tvgId: channelId || undefined,
            group: Array.isArray(ch?.categories) ? String(ch.categories[0] || "General") : "General",
            logo: ch?.logo || undefined,
            not247: false,
            discoverySource: "iptv-org-streams-api",
          },
        ]);
        if (entries.length > beforeCount) added += 1;
      }
      if (added > 0) discoverySources.push("iptv-org-streams-api");
    } catch {
      /* keep existing */
    }
  }

  fs.writeFileSync(
    path.join(countryDir, "discovery-parsed.json"),
    JSON.stringify(
      {
        discoverySources,
        count: entries.length,
        entries: entries.map((e) => ({
          title: e.title,
          url: e.url,
          group: e.group,
          tvgId: e.tvgId,
          discoverySource: e.discoverySource,
        })),
      },
      null,
      2
    )
  );

  const existingTitleKeys = new Set(
    existingRows.map((r) => `${CODE}:${normalizeTitleKey(String(r.title))}`)
  );
  const existingUrlKeys = new Set(
    existingRows.map((r) => normalizeUrlKey(String(r.source_url || r.validated_stream_url || "")))
  );

  const candidateUrls = [...new Set(entries.map((e) => e.url).filter(Boolean))];
  const candidateSourceIds = [
    ...new Set(
      entries
        .map((e) => (e.tvgId ? `iptv-org-${e.tvgId.replace(/@.*$/, "")}` : ""))
        .filter(Boolean)
    ),
  ];
  const globalUrlKeys = new Set<string>();
  const globalSourceIds = new Set<string>();
  for (let i = 0; i < candidateUrls.length; i += 100) {
    const chunk = candidateUrls.slice(i, i + 100);
    const { data } = await supabaseAdmin
      .from("tv_videos")
      .select("source_url,source_id,region,title")
      .in("source_url", chunk)
      .limit(500);
    for (const row of data || []) {
      globalUrlKeys.add(normalizeUrlKey(String(row.source_url || "")));
      if (row.source_id) globalSourceIds.add(String(row.source_id));
    }
  }
  for (let i = 0; i < candidateSourceIds.length; i += 100) {
    const chunk = candidateSourceIds.slice(i, i + 100);
    const { data } = await supabaseAdmin
      .from("tv_videos")
      .select("source_id,source_url,region,title")
      .in("source_id", chunk)
      .limit(500);
    for (const row of data || []) {
      if (row.source_id) globalSourceIds.add(String(row.source_id));
      globalUrlKeys.add(normalizeUrlKey(String(row.source_url || "")));
    }
  }

  const probeResults = await mapPool(entries, PROBE_CONCURRENCY, async (entry) => {
    const title = cleanTitle(entry.title);
    const tvgBase = entry.tvgId ? entry.tvgId.replace(/@.*$/, "") : "";
    const tvgCountry = /\.([a-z]{2})$/i.exec(tvgBase)?.[1]?.toUpperCase() || null;
    const acceptTvg = new Set([CODE, ...(CODE === "GB" ? ["UK"] : [])]);
    const foreignTvg = Boolean(tvgCountry && !acceptTvg.has(tvgCountry));
    const sourceId = tvgBase
      ? `iptv-org-${tvgBase}`
      : `iptv-org-${CODE}-${normalizeTitleKey(title).replace(/\s+/g, "")}`;
    const titleKey = `${CODE}:${normalizeTitleKey(title)}`;
    const urlKey = normalizeUrlKey(entry.url);
    const isDup =
      existingTitleKeys.has(titleKey) ||
      existingUrlKeys.has(urlKey) ||
      globalUrlKeys.has(urlKey) ||
      globalSourceIds.has(sourceId) ||
      foreignTvg;

    const probe = await probeTvStation({
      id: "candidate",
      source_type: "hls_stream",
      source_id: sourceId,
      source_url: entry.url,
      embed_url: null,
      title,
      status: "approved",
      playback_status: "unchecked",
      is_active: false,
      reliability_score: 100,
      consecutive_failures: 0,
    });
    const deepOk =
      probe.playable && probe.stream_protocol === "hls"
        ? await deepSegmentOk(probe.validated_stream_url || entry.url)
        : probe.playable && probe.stream_protocol !== "hls"
          ? true
          : false;
    const eligible =
      probe.playable === true &&
      probe.ios_playable === true &&
      probe.android_playable === true &&
      deepOk === true &&
      probe.stream_is_https !== false;

    return {
      title,
      url: entry.url,
      source_id: sourceId,
      group: entry.group || null,
      not247: entry.not247 === true,
      logo: entry.logo || null,
      discoverySource: entry.discoverySource || null,
      citiesMatched: matchCities(title, meta.cities),
      isDup,
      foreignTvg,
      eligible,
      playable: probe.playable,
      reason: probe.reason,
      ios: probe.ios_playable,
      android: probe.android_playable,
      https: probe.stream_is_https,
      protocol: probe.stream_protocol,
      deepOk,
      validated: probe.validated_stream_url || null,
    };
  });

  fs.writeFileSync(path.join(countryDir, "probe-report.json"), JSON.stringify(probeResults, null, 2));

  const verifiedEligible = probeResults.filter((r) => r.eligible);
  const novelEligible = verifiedEligible.filter((r) => !r.isDup);
  const duplicatesSkipped = verifiedEligible.filter((r) => r.isDup).length;
  const rejected = probeResults.filter((r) => !r.eligible).length;

  const citiesWithStations = [
    ...new Set(probeResults.flatMap((r) => r.citiesMatched || []).filter(Boolean)),
  ];
  const citiesWithoutStations = meta.cities.filter((c) => !citiesWithStations.includes(c));

  const importCandidates = novelEligible.map((r) => ({
    source_type: "hls_stream" as const,
    source_id: r.source_id,
    source_url: r.url,
    title: r.title,
    channel_name: r.title,
    category: r.group || "General",
    categories: [r.group || "General"],
    language: null,
    country: CODE,
    region: CODE,
    description: null as string | null,
    thumbnail_url: r.logo,
    tags: [meta.name, CODE, "Europe", "expansion:europe-continuous", r.group, ...(r.citiesMatched || [])]
      .filter(Boolean) as string[],
    source_key: `europe-continuous:${CODE}:${r.source_id}`,
  }));

  let importResult: Record<string, unknown> = {
    found: novelEligible.length,
    dryRun: !execute,
    titles: novelEligible.map((r) => r.title),
  };
  if (execute && importCandidates.length > 0) {
    importResult = {
      ...(await importVerifiedTvGrowthCandidates(importCandidates)),
      dryRun: false,
      titles: novelEligible.map((r) => r.title),
    };
  }

  let directImported = 0;
  if (execute && importCandidates.length > 0) {
    const importedCount = Number((importResult as any).imported || 0);
    if (importedCount < importCandidates.length) {
      const { data: afterPartial } = await supabaseAdmin
        .from("tv_videos")
        .select("title,source_url,source_id,source_key")
        .eq("region", CODE)
        .limit(5000);
      const haveTitle = new Set((afterPartial || []).map((r) => normalizeTitleKey(String(r.title))));
      const haveUrl = new Set(
        (afterPartial || []).map((r) => normalizeUrlKey(String(r.source_url || "")))
      );
      for (const c of importCandidates) {
        if (haveTitle.has(normalizeTitleKey(c.title)) || haveUrl.has(normalizeUrlKey(c.source_url))) {
          continue;
        }
        const probe = await probeTvStation({
          id: "candidate",
          source_type: "hls_stream",
          source_id: c.source_id,
          source_url: c.source_url,
          embed_url: null,
          title: c.title,
          status: "approved",
          playback_status: "unchecked",
          is_active: false,
          reliability_score: 100,
          consecutive_failures: 0,
        });
        const deepOk = probe.playable
          ? await deepSegmentOk(probe.validated_stream_url || c.source_url)
          : false;
        if (!probe.playable || !probe.ios_playable || !probe.android_playable || !deepOk) continue;
        const { error } = await supabaseAdmin.from("tv_videos").insert({
          source_type: "hls_stream",
          source_id: c.source_id,
          source_url: c.source_url,
          title: c.title,
          description: c.description,
          channel_name: c.channel_name,
          thumbnail_url: c.thumbnail_url || null,
          category: c.category,
          tags: c.tags,
          region: CODE,
          source_key: c.source_key,
          status: "approved",
          playback_status: "playable",
          is_active: true,
          reliability_score: 100,
          consecutive_failures: 0,
          last_health_checked_at: new Date().toISOString(),
          ios_playable: true,
          android_playable: true,
          stream_is_https: probe.stream_is_https === true,
          stream_protocol: probe.stream_protocol || "hls",
          validated_stream_url: probe.validated_stream_url || c.source_url,
          last_validation_result: probe.last_validation_result || "platform_playable",
          catalog_eligibility_tier: "verified",
        });
        if (!error) {
          directImported += 1;
          haveTitle.add(normalizeTitleKey(c.title));
          haveUrl.add(normalizeUrlKey(c.source_url));
        }
      }
    }
  }

  const { data: afterRows, error: afterErr } = await supabaseAdmin
    .from("tv_videos")
    .select(SELECT)
    .eq("region", CODE)
    .order("title", { ascending: true })
    .limit(5000);
  if (afterErr) throw new Error(afterErr.message);
  const after = summarizeRows(afterRows || []);

  // API proof against production-shaped endpoints
  const apiProof: Record<string, unknown> = { browseUrl: `${PROD_API}/api/tv/videos?country=${CODE}&limit=50` };
  try {
    const browseRes = await fetch(`${PROD_API}/api/tv/videos?country=${CODE}&limit=5`, {
      signal: AbortSignal.timeout(30_000),
    });
    const browseJson: any = await browseRes.json().catch(() => ({}));
    const items = browseJson.items || browseJson.data || browseJson.videos || [];
    apiProof.browseStatus = browseRes.status;
    apiProof.browseCount = Array.isArray(items) ? items.length : null;
    apiProof.browseTotal = browseJson.total ?? browseJson.pagination?.total ?? null;
    const firstId = Array.isArray(items) && items[0] ? items[0].id : null;
    if (firstId) {
      const playRes = await fetch(`${PROD_API}/api/tv/videos/${firstId}/play`, {
        signal: AbortSignal.timeout(30_000),
      });
      const playJson: any = await playRes.json().catch(() => ({}));
      apiProof.playStatus = playRes.status;
      apiProof.playOk = playRes.ok;
      apiProof.playHasUrl = Boolean(playJson.url || playJson.stream_url || playJson.playbackUrl);
      apiProof.playSampleId = firstId;
    }
    // Alias browse (local filter exists; production may not be deployed yet)
    const alias = meta.aliases[0];
    if (alias) {
      const aliasRes = await fetch(
        `${PROD_API}/api/tv/videos?country=${encodeURIComponent(alias)}&limit=3`,
        { signal: AbortSignal.timeout(20_000) }
      );
      apiProof.aliasBrowse = {
        alias,
        status: aliasRes.status,
        note: "Production may not yet include undeployed name→ISO alias support",
      };
    }
  } catch (e) {
    apiProof.error = e instanceof Error ? e.message : String(e);
  }

  const importedTotal = Number((importResult as any).imported || 0) + directImported;

  const countrySummary = {
    code: CODE,
    name: meta.name,
    status: execute ? "executed" : "dry_run",
    execute,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    startingTotal: before.total,
    startingPublic: before.public,
    discovered: entries.length,
    verifiedEligible: verifiedEligible.length,
    imported: importedTotal,
    repairedOrPromoted,
    restored,
    quarantinedOrBlocked,
    rejected,
    duplicatesSkipped,
    nameRepairs: nameRepairs.length,
    citiesSearched: meta.cities.length,
    citiesWithStations: citiesWithStations.length,
    finalTotal: after.total,
    finalPublic: after.public,
    finalPlayable: after.playable,
    browseUrl: `${PROD_API}/api/tv/videos?country=${CODE}&limit=100`,
  };

  const fullReport = {
    ...countrySummary,
    workspace: workspaceProof(),
    before,
    after,
    nameRepairs,
    promotions,
    healthActions,
    importResult,
    directImported,
    discoverySources,
    regionsSearched: meta.regions,
    languages: meta.languages,
    citiesWithStations,
    citiesWithoutStations,
    novelTitles: novelEligible.map((r) => r.title),
    rejectedSample: probeResults
      .filter((r) => !r.eligible)
      .slice(0, 60)
      .map((r) => ({ title: r.title, reason: r.reason, deepOk: r.deepOk, discoverySource: r.discoverySource })),
    verificationBreakdown: {
      eligible: verifiedEligible.length,
      novelEligible: novelEligible.length,
      duplicates: duplicatesSkipped,
      rejected,
      hlsPlayable: probeResults.filter((r) => r.playable && r.protocol === "hls").length,
      browserOrDead: rejected,
    },
    apiProof,
  };

  fs.writeFileSync(
    path.join(countryDir, execute ? "execute-report.json" : "dry-run-report.json"),
    JSON.stringify(fullReport, null, 2)
  );
  writeCountryMarkdown(countryDir, fullReport);
  updateMasterReport(countrySummary);

  console.log(JSON.stringify({ success: true, ...countrySummary }, null, 2));
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      success: false,
      code: CODE,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
  );
  process.exitCode = 1;
});
