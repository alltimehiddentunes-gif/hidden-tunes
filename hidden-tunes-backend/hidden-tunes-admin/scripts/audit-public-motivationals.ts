import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  classifyMotivationContent,
  type MotivationContentDecision,
} from "../lib/motivationContentClassifier";
import {
  MOTIVATION_DEFAULT_PAGE_SIZE,
  MOTIVATION_MAX_PAGE_SIZE,
  MOTIVATION_RELIABILITY_THRESHOLD,
  applyPublicMotivationFilters,
} from "../lib/motivationCatalog";
import { normalizeMotivationMetadata } from "../lib/motivationMetadataNormalize";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");

const WATCHLIST_TERMS = [
  "MIT15.969F04",
  "MIT Cryptocurrency Engineering",
  "MIT How To Speak",
  "Mindwarz Videos",
  "The Light Of Faith",
];

const WATCHLIST_PATTERNS = WATCHLIST_TERMS.map((term) => new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));

type AuditRow = {
  id: string;
  title: string | null;
  status: string | null;
  is_active: boolean | null;
  is_verified: boolean | null;
  playback_status: string | null;
  content_classification: string | null;
  classifier_decision: MotivationContentDecision;
  classifier_confidence: number;
  classifier_reason: string;
  watchlist_match: string | null;
  needs_manual_review: boolean;
};

type AuditTotals = {
  public_examined: number;
  accepted: number;
  held: number;
  rejected: number;
  route_lectures: number;
  route_podcasts: number;
  route_films: number;
  route_tv: number;
  route_audiobooks: number;
  execution_errors: number;
};

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
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

function watchlistLabel(title: string, description: string | null, sourceId: string | null) {
  const haystack = `${title} ${description || ""} ${sourceId || ""}`;
  for (const pattern of WATCHLIST_PATTERNS) {
    if (pattern.test(haystack)) return pattern.source;
  }
  return null;
}

function incrementDecisionTotals(totals: AuditTotals, decision: MotivationContentDecision) {
  if (decision === "accept") totals.accepted += 1;
  else if (decision === "hold") totals.held += 1;
  else if (decision === "reject") totals.rejected += 1;
  else if (decision === "route_lectures") totals.route_lectures += 1;
  else if (decision === "route_podcasts") totals.route_podcasts += 1;
  else if (decision === "route_films") totals.route_films += 1;
  else if (decision === "route_tv") totals.route_tv += 1;
  else if (decision === "route_audiobooks") totals.route_audiobooks += 1;
}

async function auditPublicPage(
  page: number,
  pageSize: number,
  supabaseAdmin: Awaited<typeof import("../lib/supabaseAdmin")>["supabaseAdmin"]
) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabaseAdmin
    .from("motivation_items")
    .select(
      "id, title, description, status, is_active, is_verified, playback_status, reliability_score, content_classification, source_id, source_type, speaker_name, channel_name, creator_name, tags, category, subcategory, language, region, duration_seconds"
    )
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  query = applyPublicMotivationFilters(query, {});

  let { data, error } = await query.range(from, to);
  if (error && String(error.message).includes("content_classification")) {
    let fallback = supabaseAdmin
      .from("motivation_items")
      .select(
        "id, title, description, status, is_active, is_verified, playback_status, reliability_score, source_id, source_type, speaker_name, channel_name, creator_name, tags, category, subcategory, language, region, duration_seconds"
      )
      .eq("status", "approved")
      .eq("is_active", true)
      .eq("is_verified", true)
      .eq("playback_status", "playable")
      .eq("is_mature", false)
      .gte("reliability_score", MOTIVATION_RELIABILITY_THRESHOLD)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    ({ data, error } = await fallback.range(from, to));
  }
  if (error) throw new Error(error.message);

  const rows: AuditRow[] = [];

  for (const row of (data || []) as Array<Record<string, unknown>>) {
    const normalized = normalizeMotivationMetadata({
      title: String(row.title || ""),
      description: String(row.description || ""),
      creator: String(row.creator_name || row.channel_name || ""),
      speaker: String(row.speaker_name || ""),
      channel: String(row.channel_name || ""),
      tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
      language: String(row.language || ""),
      country: String(row.region || ""),
    });

    const classification = classifyMotivationContent({
      title: normalized.title,
      description: normalized.description,
      tags: normalized.tags,
      creator: normalized.creator,
      speaker: normalized.speaker,
      channel: normalized.channel,
      sourceType: String(row.source_type || ""),
      runtimeSeconds: Number(row.duration_seconds ?? 0) || null,
      language: normalized.language,
      category: String(row.category || ""),
    });

    const title = normalized.title || String(row.title || "");
    const watchlist = watchlistLabel(title, normalized.description, String(row.source_id || ""));

    const storedClassification = String(row.content_classification || "unknown");
    const needsManualReview =
      classification.decision !== "accept" ||
      (storedClassification !== "unknown" &&
        storedClassification !== "accept" &&
        storedClassification !== classification.decision) ||
      Boolean(watchlist);

    rows.push({
      id: String(row.id || ""),
      title,
      status: String(row.status || ""),
      is_active: row.is_active === true,
      is_verified: row.is_verified === true,
      playback_status: String(row.playback_status || ""),
      content_classification: storedClassification,
      classifier_decision: classification.decision,
      classifier_confidence: classification.confidence,
      classifier_reason: classification.reason,
      watchlist_match: watchlist,
      needs_manual_review: needsManualReview,
    });
  }

  return rows;
}

async function auditWatchlistRecords(
  supabaseAdmin: Awaited<typeof import("../lib/supabaseAdmin")>["supabaseAdmin"]
) {
  const found: AuditRow[] = [];
  const seen = new Set<string>();

  for (const term of WATCHLIST_TERMS) {
    const { data, error } = await supabaseAdmin
      .from("motivation_items")
      .select(
        "id, title, description, status, is_active, is_verified, playback_status, content_classification, source_id, source_type, speaker_name, channel_name, creator_name, tags, category, subcategory, language, region, duration_seconds"
      )
      .or(`title.ilike.%${term}%,description.ilike.%${term}%,source_id.ilike.%${term}%`)
      .limit(10);
    if (error) continue;

    for (const row of (data || []) as Array<Record<string, unknown>>) {
      const id = String(row.id || "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const normalized = normalizeMotivationMetadata({
        title: String(row.title || ""),
        description: String(row.description || ""),
        creator: String(row.creator_name || row.channel_name || ""),
        speaker: String(row.speaker_name || ""),
        channel: String(row.channel_name || ""),
        tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
      });
      const classification = classifyMotivationContent({
        title: normalized.title,
        description: normalized.description,
        tags: normalized.tags,
        sourceType: String(row.source_type || ""),
      });
      const title = normalized.title || String(row.title || "");
      const watchlist = watchlistLabel(title, normalized.description, String(row.source_id || ""));
      if (!watchlist) continue;
      found.push({
        id: String(row.id || ""),
        title,
        status: String(row.status || ""),
        is_active: row.is_active === true,
        is_verified: row.is_verified === true,
        playback_status: String(row.playback_status || ""),
        content_classification: String(row.content_classification || "unknown"),
        classifier_decision: classification.decision,
        classifier_confidence: classification.confidence,
        classifier_reason: classification.reason,
        watchlist_match: watchlist,
        needs_manual_review: true,
      });
    }
  }
  return found;
}

async function main() {
  loadEnvFile(path.join(adminRoot, ".env.local"));
  loadEnvFile(path.join(adminRoot, ".env"));

  const pageSize = Math.min(
    MOTIVATION_MAX_PAGE_SIZE,
    Math.max(1, Number(process.env.MOTIVATION_AUDIT_PAGE_SIZE || MOTIVATION_DEFAULT_PAGE_SIZE))
  );

  const { supabaseAdmin } = await import("../lib/supabaseAdmin");
  const totals: AuditTotals = {
    public_examined: 0,
    accepted: 0,
    held: 0,
    rejected: 0,
    route_lectures: 0,
    route_podcasts: 0,
    route_films: 0,
    route_tv: 0,
    route_audiobooks: 0,
    execution_errors: 0,
  };

  const reviewed: AuditRow[] = [];
  const questionable: AuditRow[] = [];
  let page = 1;

  while (true) {
    let rows: AuditRow[] = [];
    try {
      rows = await auditPublicPage(page, pageSize, supabaseAdmin);
    } catch (error) {
      totals.execution_errors += 1;
      throw error;
    }

    if (rows.length === 0) break;

    for (const row of rows) {
      totals.public_examined += 1;
      incrementDecisionTotals(totals, row.classifier_decision);
      reviewed.push(row);
      if (row.needs_manual_review) questionable.push(row);
    }

    if (rows.length < pageSize) break;
    page += 1;
  }

  const watchlistHits = await auditWatchlistRecords(supabaseAdmin);
  for (const row of watchlistHits) {
    if (!reviewed.some((entry) => entry.id === row.id)) {
      questionable.push(row);
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    read_only: true,
    page_size: pageSize,
    reliability_threshold: MOTIVATION_RELIABILITY_THRESHOLD,
    totals,
    questionable_public_items: questionable,
    watchlist_checks: watchlistHits,
    reviewed_public_items: reviewed,
  };

  const reportPath = path.join(adminRoot, "data", "motivation-public-audit-report.json");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(JSON.stringify(report, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
