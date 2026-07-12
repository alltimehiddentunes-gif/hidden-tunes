import {
  detectMotivationDuplicates,
  duplicateClassificationBlocksPromotion,
  normalizeCanonicalSourceUrl,
} from "@/lib/motivationDuplicates";
import { contentClassificationAllowsPublic, type MotivationContentDecision } from "@/lib/motivationContentClassifier";
import { probeMotivationItem } from "@/lib/motivationHealth";
import { computeMotivationHealthScore } from "@/lib/motivationHealthScore";
import { verifyArchiveItemRights } from "@/lib/motivationItemRights";
import {
  MOTIVATION_CATEGORIES,
  resolveMotivationCategorySlug,
} from "@/lib/motivationCatalog";
import {
  validateMotivationSourceForItem,
  type MotivationRegistrySource,
} from "@/lib/motivationSourceRegistry";
import { validatePublicTvUrl } from "@/lib/tvStationHealth";

export type VerificationEvidenceStatus = "pass" | "fail" | "warning" | "unchecked";

export type VerificationEvidenceCheck = {
  check: string;
  status: VerificationEvidenceStatus;
  reason: string;
  source: string;
  checked_at: string;
};

export type PromotionEligibility = "eligible" | "blocked" | "manual_review";

export type MotivationVerificationEvidenceReport = {
  item_id: string;
  eligibility: PromotionEligibility;
  summary: string;
  health_score: number;
  health_status: string;
  checks: VerificationEvidenceCheck[];
};

export type MotivationVerificationItem = {
  id: string;
  title?: string | null;
  source_type?: string | null;
  source_id?: string | null;
  source_url?: string | null;
  embed_url?: string | null;
  source_key?: string | null;
  category?: string | null;
  subcategory?: string | null;
  category_slug?: string | null;
  speaker_name?: string | null;
  channel_name?: string | null;
  duration_seconds?: number | null;
  is_mature?: boolean | null;
  status?: string | null;
  description?: string | null;
  content_classification?: string | null;
  content_classification_reason?: string | null;
};

function evidence(
  check: string,
  status: VerificationEvidenceStatus,
  reason: string,
  source: string,
  checkedAt: string
): VerificationEvidenceCheck {
  return { check, status, reason, source, checked_at: checkedAt };
}

export async function buildMotivationVerificationEvidence(
  item: MotivationVerificationItem,
  registrySource: MotivationRegistrySource | null
): Promise<MotivationVerificationEvidenceReport> {
  const checkedAt = new Date().toISOString();
  const checks: VerificationEvidenceCheck[] = [];
  const itemId = String(item.id);

  const registryValidation = validateMotivationSourceForItem(registrySource, {
    source_type: item.source_type,
    source_url: item.source_url,
    media_url: null,
    is_mature: item.is_mature,
  });
  checks.push(
    evidence(
      "source_registry",
      registryValidation.ok ? "pass" : "fail",
      registryValidation.ok
        ? `Registry source ${registrySource?.source_key} validated.`
        : registryValidation.errors.join("; "),
      "motivationSourceRegistry",
      checkedAt
    )
  );
  for (const warning of registryValidation.warnings) {
    checks.push(
      evidence("source_registry", "warning", warning, "motivationSourceRegistry", checkedAt)
    );
  }

  let rightsPass = false;
  if (item.source_type === "archive_video") {
    const rights = await verifyArchiveItemRights(String(item.source_id || ""));
    rightsPass = rights.ok;
    checks.push(
      evidence(
        "rights_status",
        rights.ok ? "pass" : "fail",
        rights.reason,
        "motivationItemRights",
        checkedAt
      )
    );
  } else {
    checks.push(
      evidence(
        "rights_status",
        "fail",
        "Unsupported source type for Motivationals promotion.",
        "motivationItemRights",
        checkedAt
      )
    );
  }

  const canonicalSourceUrl = normalizeCanonicalSourceUrl(item.source_url);
  checks.push(
    evidence(
      "canonical_source_url",
      canonicalSourceUrl ? "pass" : "fail",
      canonicalSourceUrl
        ? "Canonical source URL normalized."
        : "Missing or invalid canonical source URL.",
      "motivationVerification",
      checkedAt
    )
  );

  const normalizedSlug = resolveMotivationCategorySlug(item.category, item.subcategory);
  const categoryKnown = MOTIVATION_CATEGORIES.some((entry) => entry.slug === normalizedSlug);
  checks.push(
    evidence(
      "category_validity",
      categoryKnown ? "pass" : "fail",
      categoryKnown ? `Category slug ${normalizedSlug}.` : `Unknown category slug ${normalizedSlug}.`,
      "motivationCatalog",
      checkedAt
    )
  );

  checks.push(
    evidence(
      "maturity_classification",
      item.is_mature === true ? "warning" : "pass",
      item.is_mature === true ? "Item marked mature; public promotion blocked." : "Non-mature item.",
      "motivationVerification",
      checkedAt
    )
  );

  const metadataComplete = Boolean(
    item.title?.trim() &&
      (item.description?.trim() || item.category?.trim()) &&
      (item.speaker_name?.trim() || item.channel_name?.trim())
  );
  checks.push(
    evidence(
      "metadata_completeness",
      metadataComplete ? "pass" : "warning",
      metadataComplete
        ? "Required metadata fields present."
        : "Metadata incomplete for promotion review.",
      "motivationVerification",
      checkedAt
    )
  );

  const classificationDecision = String(item.content_classification || "hold") as MotivationContentDecision;
  const classificationPass = contentClassificationAllowsPublic(classificationDecision);
  checks.push(
    evidence(
      "content_classification",
      classificationPass ? "pass" : "fail",
      classificationPass
        ? "Content classified as motivational accept."
        : item.content_classification_reason ||
          `Content classification ${classificationDecision} blocks promotion.`,
      "motivationContentClassifier",
      checkedAt
    )
  );

  let mediaPass = false;
  let primaryFilePass = false;
  let probeReason = "Primary file not checked.";
  let mediaUrl: string | null = null;

  const duplicate = await detectMotivationDuplicates({
    item_id: itemId,
    source_type: item.source_type,
    source_id: item.source_id,
    source_key: item.source_key,
    source_url: item.source_url,
    title: item.title,
    speaker_name: item.speaker_name,
    channel_name: item.channel_name,
    duration_seconds: item.duration_seconds,
    registry_source_key: registrySource?.source_key || null,
  });

  checks.push(
    evidence(
      "duplicate_result",
      duplicate.classification === "none"
        ? "pass"
        : duplicate.classification === "possible"
          ? "warning"
          : "fail",
      `${duplicate.classification}: ${duplicate.reason}`,
      "motivationDuplicates",
      checkedAt
    )
  );

  const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
  const { data: file } = await supabaseAdmin
    .from("motivation_files")
    .select("id, media_type, audio_url, video_url, playback_status, is_primary")
    .eq("item_id", itemId)
    .eq("is_primary", true)
    .maybeSingle();

  if (!file?.id) {
    checks.push(
      evidence(
        "primary_file_validity",
        "fail",
        "Missing primary motivation file.",
        "motivationVerification",
        checkedAt
      )
    );
    checks.push(
      evidence(
        "media_availability",
        "unchecked",
        "Media probe skipped because primary file is missing.",
        "motivationHealth",
        checkedAt
      )
    );
  } else {
    const mediaType = String(file.media_type || "").toLowerCase();
    mediaUrl =
      mediaType === "audio"
        ? String(file.audio_url || "")
        : String(file.video_url || item.source_url || "");
    const urlCheck = validatePublicTvUrl(mediaUrl);
    primaryFilePass = urlCheck.ok && ["audio", "video"].includes(mediaType);
    checks.push(
      evidence(
        "primary_file_validity",
        primaryFilePass ? "pass" : "fail",
        primaryFilePass
          ? `Primary ${mediaType} file validated.`
          : `Primary file invalid: ${urlCheck.ok ? "unsupported media type" : urlCheck.reason}`,
        "motivationVerification",
        checkedAt
      )
    );

    if (urlCheck.ok) {
      const probe = await probeMotivationItem({
        source_type: String(item.source_type || ""),
        source_id: String(item.source_id || ""),
        source_url: urlCheck.url,
        embed_url: item.embed_url,
      });
      mediaPass = probe.playable;
      probeReason = probe.reason;
      checks.push(
        evidence(
          "media_availability",
          probe.playable ? "pass" : "fail",
          probe.reason,
          "motivationHealth",
          checkedAt
        )
      );
      checks.push(
        evidence(
          "health_probe_status",
          probe.playable ? "pass" : "fail",
          probe.playable ? "Media probe passed." : probe.reason,
          "motivationHealth",
          checkedAt
        )
      );
    } else {
      checks.push(
        evidence(
          "media_availability",
          "fail",
          urlCheck.reason,
          "motivationHealth",
          checkedAt
        )
      );
    }
  }

  const health = computeMotivationHealthScore({
    media_probe_pass: mediaPass,
    rights_pass: rightsPass,
    metadata_complete: metadataComplete,
    primary_file_pass: primaryFilePass,
    duplicate_classification: duplicate.classification,
    category_valid: categoryKnown,
    maturity_valid: item.is_mature !== true,
    registry_valid: registryValidation.ok,
    content_classification_pass: classificationPass,
  });

  checks.push(
    evidence(
      "reviewer_decision",
      "unchecked",
      "Awaiting explicit promotion review decision.",
      "motivationPromotion",
      checkedAt
    )
  );

  const blockingFailures = checks.filter(
    (row) =>
      row.status === "fail" &&
      !["reviewer_decision"].includes(row.check)
  );
  const hasManualReview =
    duplicate.classification === "possible" ||
    checks.some((row) => row.status === "warning");

  let eligibility: PromotionEligibility = "eligible";
  let summary = "All required promotion checks passed.";

  if (
    blockingFailures.length > 0 ||
    duplicateClassificationBlocksPromotion(duplicate.classification) ||
    !registryValidation.ok ||
    !rightsPass ||
    !mediaPass ||
    !primaryFilePass ||
    !categoryKnown ||
    !classificationPass ||
    item.is_mature === true
  ) {
    eligibility = "blocked";
    summary = blockingFailures.map((row) => `${row.check}: ${row.reason}`).join("; ") || "Promotion blocked.";
  } else if (hasManualReview) {
    eligibility = "manual_review";
    summary = "Manual review recommended before promotion.";
  }

  return {
    item_id: itemId,
    eligibility,
    summary,
    health_score: health.score,
    health_status: health.status,
    checks,
  };
}
