import type { DuplicateClassification } from "@/lib/motivationDuplicates";

export type MotivationHealthStatus = "healthy" | "warning" | "unhealthy" | "unchecked";

export type MotivationHealthScoreInput = {
  media_probe_pass: boolean;
  rights_pass: boolean;
  metadata_complete: boolean;
  primary_file_pass: boolean;
  duplicate_classification: DuplicateClassification;
  category_valid: boolean;
  maturity_valid: boolean;
  registry_valid: boolean;
};

export type MotivationHealthScoreResult = {
  score: number;
  status: MotivationHealthStatus;
  reasons: string[];
  components: Record<string, number>;
};

const WEIGHTS = {
  media_probe: 35,
  rights_source: 20,
  metadata: 15,
  primary_file: 15,
  duplicate_safety: 10,
  category_maturity: 5,
} as const;

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function computeMotivationHealthScore(
  input: MotivationHealthScoreInput
): MotivationHealthScoreResult {
  const reasons: string[] = [];
  const components: Record<string, number> = {};

  components.media_probe = input.media_probe_pass ? WEIGHTS.media_probe : 0;
  if (!input.media_probe_pass) reasons.push("Media probe failed or unchecked.");

  components.rights_source =
    input.rights_pass && input.registry_valid ? WEIGHTS.rights_source : 0;
  if (!input.rights_pass) reasons.push("Rights validation failed.");
  if (!input.registry_valid) reasons.push("Source registry validation failed.");

  components.metadata = input.metadata_complete ? WEIGHTS.metadata : Math.round(WEIGHTS.metadata * 0.4);
  if (!input.metadata_complete) reasons.push("Metadata incomplete.");

  components.primary_file = input.primary_file_pass ? WEIGHTS.primary_file : 0;
  if (!input.primary_file_pass) reasons.push("Primary file invalid or missing.");

  if (input.duplicate_classification === "exact" || input.duplicate_classification === "strong") {
    components.duplicate_safety = 0;
    reasons.push(`Duplicate classification ${input.duplicate_classification}.`);
  } else if (input.duplicate_classification === "possible") {
    components.duplicate_safety = Math.round(WEIGHTS.duplicate_safety * 0.4);
    reasons.push("Possible duplicate requires manual review.");
  } else {
    components.duplicate_safety = WEIGHTS.duplicate_safety;
  }

  components.category_maturity =
    input.category_valid && input.maturity_valid ? WEIGHTS.category_maturity : 0;
  if (!input.category_valid) reasons.push("Category invalid.");
  if (!input.maturity_valid) reasons.push("Maturity policy blocks public promotion.");

  const score = clampScore(
    Object.values(components).reduce((sum, value) => sum + value, 0)
  );

  const hasCriticalFailure =
    !input.media_probe_pass ||
    !input.rights_pass ||
    !input.registry_valid ||
    !input.primary_file_pass ||
    input.duplicate_classification === "exact" ||
    input.duplicate_classification === "strong";

  let status: MotivationHealthStatus = "unchecked";
  if (hasCriticalFailure) status = "unhealthy";
  else if (input.duplicate_classification === "possible" || !input.metadata_complete) {
    status = "warning";
  } else if (score >= 80) status = "healthy";
  else if (score >= 50) status = "warning";
  else status = "unhealthy";

  return { score, status, reasons, components };
}

export async function persistMotivationHealthScore(
  itemId: string,
  result: MotivationHealthScoreResult
) {
  const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
  const nowIso = new Date().toISOString();
  const payload = {
    reliability_score: result.score,
    last_health_checked_at: nowIso,
    last_health_error:
      result.reasons.length > 0 ? result.reasons.slice(0, 5).join("; ").slice(0, 500) : null,
    updated_at: nowIso,
  };

  const { error } = await supabaseAdmin.from("motivation_items").update(payload).eq("id", itemId);
  if (error) throw new Error(error.message);

  return {
    health_score: result.score,
    health_status: result.status,
    health_checked_at: nowIso,
    health_reasons: result.reasons,
  };
}
