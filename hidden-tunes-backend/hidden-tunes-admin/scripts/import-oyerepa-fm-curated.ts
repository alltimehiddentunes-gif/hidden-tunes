/**
 * Curated import: Oyerepa FM 100.7 (Ghana) into production radio_stations.
 *
 * Uses existing importer + stream verification pipeline (same path as wave1 /
 * broadcaster playlist harvest). Does not deploy, commit, or push.
 *
 *   npx tsx scripts/import-oyerepa-fm-curated.ts
 *   npx tsx scripts/import-oyerepa-fm-curated.ts --execute
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import {
  findExistingRadioStationId,
  insertNewRadioStationOnly,
} from "@/lib/radioExpansion25k/insertOnlyImport";
import { buildRadioSourceUpdatePayload } from "@/lib/radioCatalogWorker";
import {
  buildRadioStationFingerprint,
  cleanRadioText,
  getHomepageHost,
  normalizeRadioName,
  normalizeRadioUrl,
  type NormalizedRadioStation,
} from "@/lib/radioNormalization";
import { isPublicRadioRow } from "@/lib/radioPublicCatalog";
import {
  applyRadioVerificationProbe,
  isPublicRadioEligible,
  probeRadioStream,
} from "@/lib/radioStreamVerification";

const adminRoot = path.resolve(__dirname, "..");
const RESULT_PATH = path.join(adminRoot, "data", "oyerepa-fm-curated-import-result.json");
const ADMIN_API = "https://admin.hiddentunes.com";

const STREAM_URL = "https://oyerepa-atunwadigital.streamguys1.com/oyerepa";
const HOMEPAGE = "https://oyerepafmonline.com/";
const LOGO =
  "https://i0.wp.com/oyerepafmonline.com/wp-content/uploads/2021/09/cropped-cropped-cropped-oyerepa_Otv_2s-1.png?fit=512%2C512&ssl=1";
const SOURCE_STATION_ID = "curated_oyerepa_fm_1007_gh";
const DISPLAY_NAME = "Oyerepa FM 100.7";
const ALIASES = [
  "Oyerepa FM",
  "Oyerepa Radio",
  "Oyerepa 100.7",
  "100.7 Oyerepa FM",
];

function hashId(value: string) {
  return createHash("sha1").update(value).digest("hex").slice(0, 32);
}

function buildCandidate(): NormalizedRadioStation {
  const sourceStreamUrl = normalizeRadioUrl(STREAM_URL, { stream: true });
  const normalizedStreamUrl = normalizeRadioUrl(sourceStreamUrl, {
    stream: true,
  }).toLowerCase();
  const cleanedName = cleanRadioText(DISPLAY_NAME, 300);
  const normalizedName = normalizeRadioName(cleanedName);
  const homepageUrl = normalizeRadioUrl(HOMEPAGE) || null;
  const host = getHomepageHost(homepageUrl);
  const faviconUrl = normalizeRadioUrl(LOGO) || null;
  const now = new Date().toISOString();
  const countryCode = "GH";

  if (!sourceStreamUrl || !normalizedStreamUrl || !cleanedName || !normalizedName) {
    throw new Error("failed_to_normalize_oyerepa_candidate");
  }

  return {
    name: cleanedName,
    normalized_name: normalizedName,
    station_fingerprint: buildRadioStationFingerprint({
      normalized_stream_url: normalizedStreamUrl,
      normalized_name: normalizedName,
      country_code: countryCode,
      normalized_homepage_host: host,
    }),
    fingerprint_version: 1,
    // Type contract requires radio_browser; curated provenance retained in source_server.
    source_name: "radio_browser",
    source_type: "radio_browser",
    source_uuid: SOURCE_STATION_ID,
    source_station_id: SOURCE_STATION_ID,
    source_station_uuid: SOURCE_STATION_ID,
    source_server: "hidden_tunes_trusted_catalog",
    source_stream_url: sourceStreamUrl,
    stream_url: sourceStreamUrl,
    normalized_stream_url: normalizedStreamUrl,
    homepage_url: homepageUrl,
    normalized_homepage_host: host,
    favicon_url: faviconUrl,
    country: "Ghana",
    country_code: countryCode,
    state: "Ashanti",
    language: "twi,akan,english",
    tags: ["news", "talk", "ghana", "kumasi", "oyerepa"],
    bitrate: 64,
    codec: "MP3",
    votes: null,
    click_count: null,
    category_slug: "news",
    categories: ["news", "talk"],
    source_payload_hash: hashId(`${SOURCE_STATION_ID}|${normalizedStreamUrl}`),
    source_last_seen_at: now,
    is_active: true,
    last_checked_at: now,
  };
}

async function auditDuplicates(supabase: SupabaseClient, candidate: NormalizedRadioStation) {
  const streamExact = await supabase
    .from("radio_stations")
    .select(
      "id,name,stream_url,normalized_stream_url,country_code,city,state,status,is_active,is_verified,playback_status,is_mature,quarantined_at,disabled_at,aliases,homepage_url,favicon_url,source_name,source_station_id,normalized_name",
    )
    .eq("normalized_stream_url", candidate.normalized_stream_url)
    .limit(20);

  const nameHits = await supabase
    .from("radio_stations")
    .select(
      "id,name,stream_url,normalized_stream_url,country_code,city,state,status,is_active,is_verified,playback_status,is_mature,quarantined_at,disabled_at,aliases,homepage_url,source_name,source_station_id,normalized_name,tags",
    )
    .or(
      [
        "name.ilike.%oyerepa%",
        "normalized_name.ilike.%oyerepa%",
        "aliases.cs.{Oyerepa}",
        "aliases.cs.{Oyerepa FM}",
        "homepage_url.ilike.%oyerepafmonline%",
        "tags.cs.{oyerepa}",
        "tags.cs.{oyerepa fm}",
      ].join(","),
    )
    .limit(50);

  const ghanaKumasi = await supabase
    .from("radio_stations")
    .select("id,name,stream_url,country_code,city,state,normalized_name")
    .eq("country_code", "GH")
    .or("city.ilike.%kumasi%,state.ilike.%ashanti%,name.ilike.%100.7%")
    .limit(50);

  const finder = await findExistingRadioStationId(supabase, candidate);

  const decoys = (nameHits.data || []).filter((row) => {
    const name = String(row.name || "").toLowerCase();
    const stream = String(row.stream_url || row.normalized_stream_url || "").toLowerCase();
    const tags = Array.isArray(row.tags) ? row.tags.join(" ").toLowerCase() : "";
    const isAdum = name.includes("adum");
    const isZeno = stream.includes("zeno.fm");
    const taggedOnly =
      tags.includes("oyerepa") && !name.includes("oyerepa") && stream !== candidate.normalized_stream_url;
    return isAdum || isZeno || taggedOnly;
  });

  const realMatches = (nameHits.data || []).filter((row) => {
    const id = String(row.id);
    if (decoys.some((d) => String(d.id) === id)) return false;
    const name = String(row.name || "").toLowerCase();
    const stream = String(row.normalized_stream_url || "").toLowerCase();
    const homepage = String(row.homepage_url || "").toLowerCase();
    return (
      name.includes("oyerepa") ||
      stream === candidate.normalized_stream_url ||
      homepage.includes("oyerepafmonline.com")
    );
  });

  return {
    finder,
    stream_exact: streamExact.data || [],
    stream_exact_error: streamExact.error?.message || null,
    name_hits: nameHits.data || [],
    name_hits_error: nameHits.error?.message || null,
    ghana_kumasi_1007_sample: ghanaKumasi.data || [],
    decoys,
    real_matches: realMatches,
  };
}

async function probeLogo(url: string) {
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": "HiddenTunes/1.0 oyerepa-fm-curated-import" },
    });
    const contentType = response.headers.get("content-type");
    const buf = Buffer.from(await response.arrayBuffer());
    const looksHtml = /text\/html/i.test(contentType || "") || /^\s*</.test(buf.toString("utf8", 0, 64));
    return {
      url: response.url,
      status: response.status,
      contentType,
      bytes: buf.length,
      looksHtml,
      ok: response.ok && !looksHtml && /^image\//i.test(contentType || ""),
    };
  } catch (error) {
    return {
      url,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "HiddenTunes/1.0 oyerepa-fm-curated-import" },
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { status: response.status, json };
}

async function provePublicApi(stationId: string) {
  const searches = [
    "Oyerepa",
    "Oyerepa FM",
    "Oyerepa 100.7",
    "100.7 Oyerepa FM",
  ];
  const searchResults: Record<string, unknown> = {};
  for (const q of searches) {
    const url = `${ADMIN_API}/api/radio/stations?q=${encodeURIComponent(q)}&page=1&limit=20&include_stream=1`;
    const result = await fetchJson(url);
    const stations = Array.isArray((result.json as { stations?: unknown[] })?.stations)
      ? ((result.json as { stations: Array<{ id?: string; name?: string }> }).stations)
      : [];
    searchResults[q] = {
      status: result.status,
      total: (result.json as { pagination?: { total?: number } })?.pagination?.total ?? stations.length,
      includes_target: stations.some((s) => String(s.id) === stationId),
      names: stations.slice(0, 8).map((s) => ({ id: s.id, name: s.name })),
    };
  }

  const ghana = await fetchJson(
    `${ADMIN_API}/api/radio/stations?q=Ghana&page=1&limit=40&include_stream=1`,
  );
  const ghanaStations = Array.isArray((ghana.json as { stations?: unknown[] })?.stations)
    ? ((ghana.json as { stations: Array<{ id?: string; name?: string; country_code?: string }> }).stations)
    : [];

  const news = await fetchJson(
    `${ADMIN_API}/api/radio/stations?q=news&page=1&limit=40&include_stream=1`,
  );
  const talk = await fetchJson(
    `${ADMIN_API}/api/radio/stations?q=talk&page=1&limit=40&include_stream=1`,
  );
  const play = await fetchJson(`${ADMIN_API}/api/radio/stations/${stationId}/play`);

  return {
    searches: searchResults,
    ghana_browse: {
      status: ghana.status,
      includes_target: ghanaStations.some((s) => String(s.id) === stationId),
      sample: ghanaStations
        .filter((s) => String(s.country_code || "").toUpperCase() === "GH" || /ghana|oyerepa/i.test(String(s.name)))
        .slice(0, 10),
    },
    news_query: {
      status: news.status,
      includes_target: Array.isArray((news.json as { stations?: Array<{ id?: string }> })?.stations)
        ? (news.json as { stations: Array<{ id?: string }> }).stations.some((s) => String(s.id) === stationId)
        : false,
    },
    talk_query: {
      status: talk.status,
      includes_target: Array.isArray((talk.json as { stations?: Array<{ id?: string }> })?.stations)
        ? (talk.json as { stations: Array<{ id?: string }> }).stations.some((s) => String(s.id) === stationId)
        : false,
    },
    play,
  };
}

async function main() {
  loadAdminEnv(adminRoot);
  const execute = process.argv.includes("--execute");
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("missing_supabase_credentials");
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Sanity: Amen FM must exist if this is production catalog used by admin.hiddentunes.com
  const amen = await supabase
    .from("radio_stations")
    .select("id,name")
    .eq("id", "2f224de3-182b-45e2-b1a8-e434d5d8e175")
    .maybeSingle();

  const candidate = buildCandidate();
  const logo = await probeLogo(LOGO);
  const audit = await auditDuplicates(supabase, candidate);

  const report: Record<string, unknown> = {
    started_at: new Date().toISOString(),
    execute,
    workspace: adminRoot,
    supabase_host: new URL(supabaseUrl).host,
    amen_fm_present: Boolean(amen.data?.id),
    amen_fm_error: amen.error?.message || null,
    candidate: {
      name: candidate.name,
      stream_url: candidate.stream_url,
      normalized_stream_url: candidate.normalized_stream_url,
      source_station_id: candidate.source_station_id,
      source_server: candidate.source_server,
      country_code: candidate.country_code,
      categories: candidate.categories,
      bitrate: candidate.bitrate,
      codec: candidate.codec,
    },
    logo,
    duplicate_audit: audit,
    oyerepa_tv_imported: false,
    oyerepa_tv_status: "pending verified video source",
  };

  if (!amen.data?.id) {
    report.error = "supabase_does_not_look_like_production_radio_catalog";
    fs.mkdirSync(path.dirname(RESULT_PATH), { recursive: true });
    fs.writeFileSync(RESULT_PATH, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(2);
  }

  if (!execute) {
    report.mode = "dry_run";
    report.next = "Re-run with --execute to upsert, verify, and promote.";
    fs.mkdirSync(path.dirname(RESULT_PATH), { recursive: true });
    fs.writeFileSync(RESULT_PATH, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  let stationId: string | null = audit.finder?.id || audit.real_matches[0]?.id || null;
  let importOutcome: string;

  if (stationId) {
    const updatePayload = {
      ...buildRadioSourceUpdatePayload(candidate, null),
      name: candidate.name,
      country: candidate.country,
      country_code: candidate.country_code,
      state: candidate.state,
      city: "Kumasi",
      language: candidate.language,
      tags: candidate.tags,
      categories: candidate.categories,
      category_slug: candidate.category_slug,
      bitrate: candidate.bitrate,
      codec: candidate.codec,
      favicon_url: candidate.favicon_url,
      homepage_url: candidate.homepage_url,
      stream_url: candidate.stream_url,
      source_stream_url: candidate.source_stream_url,
      aliases: ALIASES,
      broadcaster_name: "Oyerepa",
      is_active: true,
      is_mature: false,
      status: "approved",
      is_curated: true,
      metadata_locked: true,
      manual_override: true,
    };
    const { error } = await supabase.from("radio_stations").update(updatePayload).eq("id", stationId);
    if (error) throw error;
    importOutcome = "repaired_existing";
  } else {
    const inserted = await insertNewRadioStationOnly(supabase, candidate, { dryRun: false });
    if (inserted.outcome === "duplicate" && inserted.reason) {
      // Race / finder miss — re-resolve
      const again = await findExistingRadioStationId(supabase, candidate);
      stationId = again?.id || null;
      importOutcome = `duplicate_${inserted.reason}`;
    } else if (inserted.outcome === "inserted" && inserted.stationId) {
      stationId = inserted.stationId;
      importOutcome = "inserted";
    } else {
      throw new Error(`import_failed:${inserted.outcome}:${inserted.error || ""}`);
    }

    if (!stationId) throw new Error("import_produced_no_station_id");

    const curatedPatch = {
      city: "Kumasi",
      state: "Ashanti",
      aliases: ALIASES,
      broadcaster_name: "Oyerepa",
      is_curated: true,
      metadata_locked: true,
      manual_override: true,
      favicon_url: candidate.favicon_url,
      bitrate: 64,
      codec: "MP3",
      categories: ["news", "talk"],
      category_slug: "news",
      tags: candidate.tags,
      language: candidate.language,
      country: "Ghana",
      country_code: "GH",
    };
    const { error: patchError } = await supabase
      .from("radio_stations")
      .update(curatedPatch)
      .eq("id", stationId);
    if (patchError) throw patchError;
  }

  const { data: row, error: rowError } = await supabase
    .from("radio_stations")
    .select(
      "id, name, stream_url, source_stream_url, playback_status, reliability_score, consecutive_failures, status, is_active, is_verified, is_mature, quarantined_at, disabled_at, health_status, aliases, city, state, country, country_code, language, categories, category_slug, tags, bitrate, codec, favicon_url, homepage_url, is_curated, metadata_locked, manual_override, last_health_checked_at, last_health_error, normalized_stream_url, source_station_id, source_server",
    )
    .eq("id", stationId!)
    .single();
  if (rowError || !row) throw rowError || new Error("station_row_missing_after_import");

  const probe = await probeRadioStream(String(row.stream_url || row.source_stream_url || ""), {
    timeoutMs: 15_000,
    maxReadBytes: 96_000,
  });
  const verificationUpdate = applyRadioVerificationProbe(row, probe);
  const nowIso = new Date().toISOString();
  const verifyPayload = {
    ...verificationUpdate,
    last_verified_at: probe.playable ? nowIso : null,
    resolved_stream_url: probe.finalUrl || row.stream_url,
    delivery_mode: "direct_https",
    stream_url: probe.finalUrl && String(probe.finalUrl).startsWith("https://")
      ? probe.finalUrl
      : row.stream_url,
  };
  const { error: verifyError } = await supabase
    .from("radio_stations")
    .update(verifyPayload)
    .eq("id", stationId!);
  if (verifyError) throw verifyError;

  const { data: finalRow, error: finalError } = await supabase
    .from("radio_stations")
    .select(
      "id, name, stream_url, source_stream_url, playback_status, reliability_score, consecutive_failures, status, is_active, is_verified, is_mature, quarantined_at, disabled_at, health_status, aliases, city, state, country, country_code, language, categories, category_slug, tags, bitrate, codec, favicon_url, homepage_url, is_curated, metadata_locked, manual_override, last_health_checked_at, last_health_error, last_verified_at, normalized_stream_url, source_station_id, source_server, delivery_mode, resolved_stream_url, broadcaster_name",
    )
    .eq("id", stationId!)
    .single();
  if (finalError || !finalRow) throw finalError || new Error("final_row_missing");

  const eligibleVerify = isPublicRadioEligible(finalRow as never);
  const eligiblePublic = isPublicRadioRow(finalRow as Record<string, unknown>);
  // Give search index / CDN a brief moment before public proof
  await new Promise((r) => setTimeout(r, 1500));
  const proof = await provePublicApi(String(stationId));

  report.mode = "execute";
  report.import_outcome = importOutcome;
  report.canonical_id = stationId;
  report.probe = probe;
  report.verification_update = verifyPayload;
  report.final_row = finalRow;
  report.public_eligible = eligibleVerify && eligiblePublic;
  report.public_eligible_verify = eligibleVerify;
  report.public_eligible_row = eligiblePublic;
  report.public_api_proof = proof;
  report.finished_at = new Date().toISOString();

  fs.mkdirSync(path.dirname(RESULT_PATH), { recursive: true });
  fs.writeFileSync(RESULT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  if (!probe.playable || !(eligibleVerify && eligiblePublic)) process.exit(3);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
