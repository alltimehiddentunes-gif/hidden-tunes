import { resolveMotivationCategorySlug } from "@/lib/motivationCatalog";
import { persistMotivationHealthScore } from "@/lib/motivationHealthScore";
import {
  buildMotivationVerificationEvidence,
  type MotivationVerificationEvidenceReport,
  type MotivationVerificationItem,
  type PromotionEligibility,
} from "@/lib/motivationVerification";
import {
  loadEnabledMotivationRegistrySources,
  resolveMotivationRegistrySourceKey,
  type MotivationRegistrySource,
} from "@/lib/motivationSourceRegistry";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type MotivationPromotionDecision = "promote" | "hold" | "reject";

export type MotivationPromotionReview = {
  item_id: string;
  title: string;
  source_key: string | null;
  source_type: string;
  source_id: string;
  category: string | null;
  category_slug: string | null;
  eligibility: PromotionEligibility;
  promotion_decision: MotivationPromotionDecision;
  rejection_or_hold_reason: string | null;
  health_score: number;
  health_status: string;
  evidence: MotivationVerificationEvidenceReport["checks"];
  rights_result: string;
  media_result: string;
  maturity_result: string;
  registry_result: string;
  file_result: string;
  duplicate_result: string;
};

export type MotivationPromotionReviewResult = {
  apply: boolean;
  items_reviewed: number;
  items_promoted: number;
  items_held: number;
  items_rejected: number;
  reviews: MotivationPromotionReview[];
};

type PromotionItemRow = MotivationVerificationItem & {
  status: string | null;
  reliability_score: number | null;
};

function decisionFromEligibility(eligibility: PromotionEligibility): MotivationPromotionDecision {
  if (eligibility === "eligible") return "promote";
  if (eligibility === "manual_review") return "hold";
  return "reject";
}

function summarizeCheck(name: string, report: MotivationVerificationEvidenceReport) {
  const row = report.checks.find((check) => check.check === name);
  return row ? `${row.status}: ${row.reason}` : "unchecked";
}

function toPromotionReview(
  item: PromotionItemRow,
  report: MotivationVerificationEvidenceReport
): MotivationPromotionReview {
  const normalizedSlug = resolveMotivationCategorySlug(item.category, item.subcategory);
  return {
    item_id: String(item.id),
    title: String(item.title || ""),
    source_key: item.source_key ? String(item.source_key) : null,
    source_type: String(item.source_type || ""),
    source_id: String(item.source_id || ""),
    category: item.category ? String(item.category) : null,
    category_slug: normalizedSlug,
    eligibility: report.eligibility,
    promotion_decision: decisionFromEligibility(report.eligibility),
    rejection_or_hold_reason:
      report.eligibility === "eligible" ? null : report.summary,
    health_score: report.health_score,
    health_status: report.health_status,
    evidence: report.checks,
    rights_result: summarizeCheck("rights_status", report),
    media_result: summarizeCheck("media_availability", report),
    maturity_result: summarizeCheck("maturity_classification", report),
    registry_result: summarizeCheck("source_registry", report),
    file_result: summarizeCheck("primary_file_validity", report),
    duplicate_result: summarizeCheck("duplicate_result", report),
  };
}

export async function reviewMotivationItemForPromotion(
  item: PromotionItemRow,
  registrySources: MotivationRegistrySource[]
): Promise<MotivationPromotionReview> {
  const registryKey = resolveMotivationRegistrySourceKey(item.source_key, registrySources);
  const registrySource =
    registrySources.find((row) => row.source_key === registryKey) || null;
  const report = await buildMotivationVerificationEvidence(item, registrySource);
  await persistMotivationHealthScore(String(item.id), {
    score: report.health_score,
    status: report.health_status as "healthy" | "warning" | "unhealthy" | "unchecked",
    reasons: report.checks
      .filter((check) => check.status === "fail" || check.status === "warning")
      .map((check) => `${check.check}: ${check.reason}`),
    components: {},
  });
  return toPromotionReview(item, report);
}

export async function applyMotivationPromotion(
  item: PromotionItemRow,
  review: MotivationPromotionReview
): Promise<{ ok: boolean; error: string | null }> {
  if (review.promotion_decision !== "promote" || review.eligibility !== "eligible") {
    return { ok: false, error: "Item did not pass promotion review." };
  }

  const itemId = String(item.id);
  const nowIso = new Date().toISOString();
  const normalizedSlug =
    review.category_slug || resolveMotivationCategorySlug(item.category, item.subcategory);

  const { error: itemUpdateError } = await supabaseAdmin
    .from("motivation_items")
    .update({
      status: "approved",
      is_active: true,
      is_verified: true,
      playback_status: "playable",
      category_slug: normalizedSlug,
      categories: [normalizedSlug],
      reliability_score: Math.max(review.health_score, 60),
      published_at: nowIso,
      updated_at: nowIso,
      last_health_checked_at: nowIso,
      last_health_error: null,
      quarantined_at: null,
    })
    .eq("id", itemId);

  if (itemUpdateError) {
    return { ok: false, error: itemUpdateError.message };
  }

  const { data: file } = await supabaseAdmin
    .from("motivation_files")
    .select("id")
    .eq("item_id", itemId)
    .eq("is_primary", true)
    .maybeSingle();

  if (file?.id) {
    await supabaseAdmin
      .from("motivation_files")
      .update({
        is_active: true,
        playback_status: "playable",
        updated_at: nowIso,
      })
      .eq("id", file.id);
  }

  return { ok: true, error: null };
}

export async function runMotivationPromotionReview(options?: {
  apply?: boolean;
  status?: "pending" | "approved";
  limit?: number;
}): Promise<MotivationPromotionReviewResult> {
  const apply = options?.apply === true;
  const status = options?.status ?? "pending";
  const limit = Math.max(1, Math.min(100, Number(options?.limit ?? 100)));

  const registrySources = await loadEnabledMotivationRegistrySources();
  const { data: items, error } = await supabaseAdmin
    .from("motivation_items")
    .select(
      "id, title, description, source_type, source_id, source_url, embed_url, source_key, category, subcategory, category_slug, status, speaker_name, channel_name, duration_seconds, is_mature, reliability_score"
    )
    .eq("status", status)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);

  const reviews: MotivationPromotionReview[] = [];
  let promoted = 0;
  let held = 0;
  let rejected = 0;

  for (const item of (items || []) as PromotionItemRow[]) {
    const review = await reviewMotivationItemForPromotion(item, registrySources);

    if (review.promotion_decision === "promote") {
      if (apply) {
        const applied = await applyMotivationPromotion(item, review);
        if (!applied.ok) {
          review.promotion_decision = "hold";
          review.eligibility = "manual_review";
          review.rejection_or_hold_reason = applied.error;
          held += 1;
          reviews.push(review);
          continue;
        }
      }
      promoted += 1;
    } else if (review.promotion_decision === "reject") {
      rejected += 1;
    } else {
      held += 1;
    }

    reviews.push(review);
  }

  return {
    apply,
    items_reviewed: reviews.length,
    items_promoted: promoted,
    items_held: held,
    items_rejected: rejected,
    reviews,
  };
}
