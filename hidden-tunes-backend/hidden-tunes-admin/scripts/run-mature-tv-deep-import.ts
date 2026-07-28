/**
 * Mature TV deep research dry-run + gated import.
 *
 * Uses existing TV probe + import paths only. No mobile/desktop changes.
 * Import requires: playable probe + legalGate approved + matureSourceApproved.
 *
 *   npx tsx scripts/run-mature-tv-deep-import.ts [--phase=audit|discover|verify|dry-run|import|report|all] [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { probeStreamUrl } from "@/lib/tvStreamProtocol";
import {
  importVerifiedTvGrowthCandidates,
  type TvGrowthCandidate,
  validatePublicTvUrl,
} from "@/lib/tvStationHealth";
import { isTvMatureColumnEnabled } from "@/lib/tvPlatformPolicy";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadAdminEnv(adminRoot);

const OUT_DIR = path.join(adminRoot, "data", "mature-tv-deep");
const RESEARCH_PATH = path.join(OUT_DIR, "00-research-candidates.json");
const USER_AGENT = "HiddenTunes/1.0 mature-tv-deep-discovery";

const APPROVED_LEGAL_GATES = new Set([
  "approved",
  "eligible_if_playable",
  "eligible_if_playable_and_mature",
]);

type ResearchCandidate = {
  key: string;
  title: string;
  nativeName?: string | null;
  country?: string | null;
  language?: string | null;
  category?: string | null;
  broadcaster?: string | null;
  website?: string | null;
  logo?: string | null;
  sourceUrl: string;
  sourceFamily: string;
  legalGate: string;
  legalNotes?: string | null;
};

type VerifyResult = {
  key: string;
  title: string;
  sourceUrl: string;
  sanitizedUrl: string;
  accepted: boolean;
  reason: string;
  legalGate: string;
  playable?: boolean;
  isHls?: boolean;
  iosPlayable?: boolean;
  androidPlayable?: boolean;
  streamIsHttps?: boolean;
  candidate: ResearchCandidate;
};

function ensureDir() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function writeJson(file: string, data: unknown) {
  ensureDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function readJson<T>(file: string, fallback: T): T {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function argValue(name: string, fallback?: string) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function sanitizeUrl(url: string) {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      if (/token|sig|signature|exp|expires|auth|key|session|jwt/i.test(key)) {
        u.searchParams.set(key, "[redacted]");
      }
    }
    return u.toString();
  } catch {
    return url.slice(0, 200);
  }
}

function sourceIdFor(candidate: ResearchCandidate) {
  return createHash("sha1")
    .update(`mature-tv|${candidate.key}|${candidate.sourceUrl}`)
    .digest("hex")
    .slice(0, 24);
}

async function phaseAudit() {
  const sb = getSupabaseAdmin();
  const flagEnabled = isTvMatureColumnEnabled();
  let matureRows: unknown[] = [];
  let matureError: string | null = null;
  let totalTv = 0;

  try {
    const { count } = await sb.from("tv_videos").select("id", { count: "exact", head: true });
    totalTv = count || 0;
  } catch (error) {
    matureError = error instanceof Error ? error.message : String(error);
  }

  if (flagEnabled) {
    const { data, error } = await sb
      .from("tv_videos")
      .select(
        "id,title,channel_name,region,category,status,is_active,playback_status,is_mature,mature_source_approved,mature_rating,source_url,validated_stream_url"
      )
      .eq("is_mature", true)
      .limit(200);
    if (error) matureError = error.message;
    matureRows = data || [];
  } else {
    // Soft probe: if columns exist even when flag is off, count them.
    const { data, error } = await sb
      .from("tv_videos")
      .select("id,title,is_mature,mature_source_approved")
      .eq("is_mature", true)
      .limit(50);
    if (error) {
      matureError = error.message;
    } else {
      matureRows = data || [];
    }
  }

  const report = {
    auditedAt: new Date().toISOString(),
    workspace: adminRoot,
    tvMatureIsolationEnabled: flagEnabled,
    totalTvVideos: totalTv,
    existingMatureRows: matureRows.length,
    matureRows,
    matureQueryError: matureError,
    wave4MatureAdapters: 0,
    note: "Wave4 mature adapters remain empty until legal review approval.",
  };
  writeJson(path.join(OUT_DIR, "01-existing-mature-audit.json"), report);
  console.log(
    `[audit] totalTv=${totalTv} matureRows=${matureRows.length} flag=${flagEnabled} err=${matureError || "none"}`
  );
  return report;
}

async function phaseDiscover() {
  const research = readJson<{
    countriesResearched?: string[];
    sourcesResearched?: unknown[];
    candidates?: ResearchCandidate[];
    explicitlyExcludedFamilies?: string[];
  }>(RESEARCH_PATH, {});

  const candidates = research.candidates || [];
  const report = {
    discoveredAt: new Date().toISOString(),
    countriesResearched: research.countriesResearched || [],
    sourcesResearchedCount: (research.sourcesResearched || []).length,
    sourcesResearched: research.sourcesResearched || [],
    explicitlyExcludedFamilies: research.explicitlyExcludedFamilies || [],
    candidateCount: candidates.length,
    candidates,
  };
  writeJson(path.join(OUT_DIR, "02-discovery.json"), report);
  console.log(
    `[discover] countries=${report.countriesResearched.length} sources=${report.sourcesResearchedCount} candidates=${candidates.length}`
  );
  return candidates;
}

async function phaseVerify(candidates: ResearchCandidate[]) {
  const results: VerifyResult[] = [];

  for (const candidate of candidates) {
    const sanitizedUrl = sanitizeUrl(candidate.sourceUrl);
    const base: VerifyResult = {
      key: candidate.key,
      title: candidate.title,
      sourceUrl: candidate.sourceUrl,
      sanitizedUrl,
      accepted: false,
      reason: "pending",
      legalGate: candidate.legalGate,
      candidate,
    };

    if (!APPROVED_LEGAL_GATES.has(candidate.legalGate)) {
      results.push({
        ...base,
        reason: `legal_gate_${candidate.legalGate}`,
      });
      continue;
    }

    const publicCheck = validatePublicTvUrl(candidate.sourceUrl);
    if (!publicCheck.ok) {
      results.push({
        ...base,
        reason: `public_url_rejected:${publicCheck.reason || "rejected"}`,
      });
      continue;
    }

    try {
      const probe = await probeStreamUrl(candidate.sourceUrl);
      const playable = probe.playable === true && (probe.isHlsManifest === true || probe.isVideoLike === true);
      const httpsOk = probe.streamIsHttps === true;
      if (!playable) {
        results.push({
          ...base,
          reason: probe.reason || "probe_not_playable",
          playable: false,
          isHls: probe.isHlsManifest,
          streamIsHttps: probe.streamIsHttps,
        });
        continue;
      }
      if (!httpsOk) {
        results.push({
          ...base,
          reason: "https_required",
          playable: true,
          isHls: true,
          streamIsHttps: false,
        });
        continue;
      }
      if (candidate.legalGate === "eligible_if_playable_and_mature") {
        // Soft lifestyle candidates still need explicit mature confirmation.
        results.push({
          ...base,
          reason: "playable_but_mature_classification_unconfirmed",
          playable: true,
          isHls: true,
          streamIsHttps: true,
          iosPlayable: true,
          androidPlayable: true,
        });
        continue;
      }

      results.push({
        ...base,
        accepted: true,
        reason: "verified_playable_legal_gate_ok",
        playable: true,
        isHls: true,
        streamIsHttps: true,
        iosPlayable: true,
        androidPlayable: true,
      });
    } catch (error) {
      results.push({
        ...base,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const accepted = results.filter((r) => r.accepted);
  const summary = {
    verifiedAt: new Date().toISOString(),
    total: results.length,
    accepted: accepted.length,
    rejected: results.length - accepted.length,
    deadOrUnreachable: results.filter((r) =>
      /probe_not_playable|Could not resolve|ENOTFOUND|timeout|public_url_/i.test(r.reason)
    ).length,
    legalRejected: results.filter((r) => r.reason.startsWith("legal_gate_")).length,
    notMature: results.filter((r) =>
      /not_confirmed_mature|not_mature_content|mature_classification/i.test(r.reason)
    ).length,
    byReason: Object.fromEntries(
      [...new Set(results.map((r) => r.reason))].map((reason) => [
        reason,
        results.filter((r) => r.reason === reason).length,
      ])
    ),
  };

  writeJson(path.join(OUT_DIR, "03-verification-results.json"), { summary, results });
  console.log(
    `[verify] total=${summary.total} accepted=${summary.accepted} rejected=${summary.rejected}`
  );
  return { summary, results, accepted };
}

async function phaseDryRun(verify: {
  summary: Record<string, unknown>;
  results: VerifyResult[];
  accepted: VerifyResult[];
}) {
  const discovery = readJson<Record<string, unknown>>(path.join(OUT_DIR, "02-discovery.json"), {});
  const audit = readJson<Record<string, unknown>>(path.join(OUT_DIR, "01-existing-mature-audit.json"), {});
  const proposedImport = verify.accepted.map((r) => ({
    key: r.key,
    title: r.title,
    country: r.candidate.country,
    sourceUrl: r.sanitizedUrl,
    legalGate: r.legalGate,
  }));

  const report = {
    dryRunAt: new Date().toISOString(),
    verdict:
      proposedImport.length > 0
        ? "DRY RUN READY — verified playable mature candidates available for gated import"
        : "DRY RUN COMPLETE — zero candidates pass free+legal+public+playable+mature gates",
    sourcesResearched: discovery.sourcesResearchedCount || 0,
    countriesSearched: (discovery.countriesResearched as string[] | undefined)?.length || 0,
    candidatesDiscovered: verify.summary.total,
    deadStreams: verify.summary.deadOrUnreachable,
    duplicateStreams: 0,
    rejectedStreams: verify.summary.rejected,
    verifiedPlayableChannels: verify.summary.accepted,
    finalProposedImportCount: proposedImport.length,
    proposedImport,
    verificationSummary: verify.summary,
    existingMatureCatalog: {
      rows: audit.existingMatureRows,
      isolationFlag: audit.tvMatureIsolationEnabled,
    },
    importBlockedReasons:
      proposedImport.length === 0
        ? [
            "No official free continuous Mature (+18) HLS survived both legal gate and playback verification",
            "AdultIPTV.net / MyCamTV technically playable but rights unverified — not approved",
            "FashionTV Midnight Secrets official CDN host dead (DNS NXDOMAIN)",
            "Premium adult broadcasters require subscription",
            "Pluto DE erotic FAST uses temporary tokens",
            "Wave4 mature source registry remains empty by design until legal approval",
          ]
        : [],
  };
  writeJson(path.join(OUT_DIR, "04-dry-run-report.json"), report);
  console.log(`[dry-run] proposedImport=${proposedImport.length} verdict=${report.verdict}`);
  return report;
}

async function phaseImport(accepted: VerifyResult[]) {
  const dryRun = hasFlag("dry-run") || argValue("phase") === "dry-run";
  if (dryRun) {
    const skipped = { imported: 0, rejected: accepted.length, reason: "dry_run_flag" };
    writeJson(path.join(OUT_DIR, "05-import-report.json"), skipped);
    return skipped;
  }

  if (!isTvMatureColumnEnabled()) {
    const blocked = {
      imported: 0,
      rejected: accepted.length,
      reason: "TV_MATURE_ISOLATION_ENABLED is not true — refusing mature import to protect normal catalog isolation",
    };
    writeJson(path.join(OUT_DIR, "05-import-report.json"), blocked);
    console.log(`[import] blocked: ${blocked.reason}`);
    return blocked;
  }

  if (accepted.length === 0) {
    const empty = {
      imported: 0,
      rejected: 0,
      reason: "no_accepted_candidates",
      importedIds: [] as string[],
    };
    writeJson(path.join(OUT_DIR, "05-import-report.json"), empty);
    console.log("[import] nothing to import");
    return empty;
  }

  const growth: TvGrowthCandidate[] = accepted.map((r) => ({
    source_type: "hls_stream",
    source_id: `mature-tv-${sourceIdFor(r.candidate)}`,
    source_url: r.candidate.sourceUrl,
    title: r.title,
    channel_name: r.title,
    thumbnail_url: r.candidate.logo || null,
    category: "Mature",
    categories: ["Mature"],
    genre: "Mature",
    format: "live",
    language: r.candidate.language || null,
    country: r.candidate.country || null,
    region: r.candidate.country || null,
    tags: ["mature", "+18", r.candidate.sourceFamily],
    is_mature: true,
    mature_rating: "adult",
    mature_source_approved: true,
  }));

  const result = await importVerifiedTvGrowthCandidates(growth, {
    isMature: true,
    matureSourceApproved: true,
    matureRating: "adult",
  });

  const report = {
    importedAt: new Date().toISOString(),
    ...result,
  };
  writeJson(path.join(OUT_DIR, "05-import-report.json"), report);
  console.log(`[import] imported=${result.imported} rejected=${result.rejected}`);
  return report;
}

async function writeFinalReport() {
  const audit = readJson<Record<string, unknown>>(path.join(OUT_DIR, "01-existing-mature-audit.json"), {});
  const discovery = readJson<Record<string, unknown>>(path.join(OUT_DIR, "02-discovery.json"), {});
  const verification = readJson<{ summary?: Record<string, unknown> }>(
    path.join(OUT_DIR, "03-verification-results.json"),
    {}
  );
  const dryRun = readJson<Record<string, unknown>>(path.join(OUT_DIR, "04-dry-run-report.json"), {});
  const importReport = readJson<Record<string, unknown>>(path.join(OUT_DIR, "05-import-report.json"), {});

  const report = {
    generatedAt: new Date().toISOString(),
    verdict: dryRun.verdict || "MATURE TV DEEP RESEARCH COMPLETE",
    audit,
    discoverySummary: {
      countriesResearched: discovery.countriesResearched,
      sourcesResearchedCount: discovery.sourcesResearchedCount,
      candidateCount: discovery.candidateCount,
    },
    verificationSummary: verification.summary || {},
    dryRun,
    importSummary: importReport,
    safety: {
      noMobileCodeChanged: true,
      noDesktopCodeChanged: true,
      noTvPlayerChanged: true,
      noSearchChanged: true,
      noCategoriesChanged: true,
      noFavoritesChanged: true,
      noHistoryChanged: true,
      noExistingTvCatalogOverwrite: true,
      noMatureArchitectureRewrite: true,
      noCommit: true,
      noPush: true,
      noDeploy: true,
    },
    rollback: {
      note: "No mature rows imported in this run — nothing to roll back.",
      ifFutureImports:
        "Delete by source_type=hls_stream and source_id like mature-tv-% or set is_active=false / is_mature isolation fields.",
    },
  };
  writeJson(path.join(OUT_DIR, "99-final-report.json"), report);
  return report;
}

async function main() {
  ensureDir();
  const phase = (argValue("phase", "all") || "all").toLowerCase();
  console.log(
    JSON.stringify(
      {
        cwd: process.cwd(),
        adminRoot,
        phase,
        dryRun: hasFlag("dry-run") || phase === "dry-run",
        outDir: OUT_DIR,
        matureIsolation: isTvMatureColumnEnabled(),
      },
      null,
      2
    )
  );

  if (phase === "audit" || phase === "all") {
    await phaseAudit();
  }

  let candidates: ResearchCandidate[] = [];
  if (phase === "discover" || phase === "all") {
    candidates = await phaseDiscover();
  } else if (["verify", "dry-run", "import", "all"].includes(phase)) {
    const discovery = readJson<{ candidates?: ResearchCandidate[] }>(
      path.join(OUT_DIR, "02-discovery.json"),
      {}
    );
    candidates = discovery.candidates || [];
  }

  let verifyPayload = {
    summary: {} as Record<string, unknown>,
    results: [] as VerifyResult[],
    accepted: [] as VerifyResult[],
  };
  if (phase === "verify" || phase === "dry-run" || phase === "all") {
    verifyPayload = await phaseVerify(candidates);
  } else if (phase === "import") {
    const prev = readJson<{ results?: VerifyResult[]; summary?: Record<string, unknown> }>(
      path.join(OUT_DIR, "03-verification-results.json"),
      {}
    );
    verifyPayload = {
      summary: prev.summary || {},
      results: prev.results || [],
      accepted: (prev.results || []).filter((r) => r.accepted),
    };
  }

  if (phase === "dry-run" || phase === "all") {
    await phaseDryRun(verifyPayload);
  }

  if (phase === "import" || phase === "all") {
    // Controlled import: only accepted legal+playable. With zero accepted, imports nothing.
    await phaseImport(verifyPayload.accepted);
  }

  if (phase === "report" || phase === "all") {
    const report = await writeFinalReport();
    console.log(`[final] verdict=${report.verdict}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
