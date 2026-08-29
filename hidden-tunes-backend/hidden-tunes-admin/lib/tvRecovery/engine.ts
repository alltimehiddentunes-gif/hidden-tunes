import { isTemporaryTvStreamUrl } from "@/lib/tvStreamProtocol";
import type { DeepStreamProbeResult } from "@/lib/tvStreamProtocol";
import type { TvRecoveryProviderRegistry } from "@/lib/tvRecovery/providerRegistry";
import type {
  TvProviderCandidate,
  TvProviderIdentity,
  TvRecoveryDuplicateDecision,
  TvRecoveryPatch,
  TvRecoveryPlan,
  TvRecoveryProbe,
  TvRecoverySourceDescriptor,
  TvRecoveryStation,
} from "@/lib/tvRecovery/types";

function stableFingerprint(value: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function comparableUrl(value: string | null | undefined) {
  try {
    const parsed = new URL(String(value || "").trim());
    parsed.hash = "";
    return parsed.toString().replace(/\/+$/, "").toLowerCase();
  } catch {
    return String(value || "").trim().replace(/\/+$/, "").toLowerCase();
  }
}

export function describeTvRecoverySource(
  value: string | null | undefined
): TvRecoverySourceDescriptor | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    const fingerprintInput = `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`.toLowerCase();
    const safePath = parsed.pathname
      .split("/")
      .map((segment) =>
        segment.length > 24 || /^[a-f0-9]{16,}$/i.test(segment) ? ":redacted" : segment
      )
      .join("/");
    return {
      protocol: parsed.protocol.replace(/:$/, ""),
      host: parsed.hostname.toLowerCase(),
      path: safePath || "/",
      fingerprint: stableFingerprint(fingerprintInput),
      temporary: isTemporaryTvStreamUrl(raw),
    };
  } catch {
    return {
      protocol: "invalid",
      host: null,
      path: null,
      fingerprint: stableFingerprint(raw),
      temporary: false,
    };
  }
}

function providerIdentityKey(identity: TvProviderIdentity | null) {
  return identity ? `${identity.providerId}:${identity.canonicalId}` : null;
}

function stationRank(station: TvRecoveryStation) {
  let score = 0;
  if (station.status === "approved") score += 1_000;
  if (station.is_active) score += 500;
  if (station.playback_status === "playable") score += 250;
  score += Math.max(0, Math.min(100, Number(station.reliability_score || 0)));
  return score;
}

function selectCanonicalStation(stations: TvRecoveryStation[]) {
  return [...stations].sort((left, right) => {
    const scoreDifference = stationRank(right) - stationRank(left);
    if (scoreDifference !== 0) return scoreDifference;
    const leftCreated = left.created_at || "9999";
    const rightCreated = right.created_at || "9999";
    const createdDifference = leftCreated.localeCompare(rightCreated);
    return createdDifference || left.id.localeCompare(right.id);
  })[0];
}

export function decideTvRecoveryDuplicate(input: {
  station: TvRecoveryStation;
  stations: TvRecoveryStation[];
  registry: TvRecoveryProviderRegistry;
  proposedSourceUrl?: string | null;
}): TvRecoveryDuplicateDecision {
  const currentIdentity = input.registry.identify(input.station);
  const currentIdentityKey = providerIdentityKey(currentIdentity);
  const proposedUrl = comparableUrl(input.proposedSourceUrl || input.station.source_url);
  const exactIdentityRows = currentIdentityKey
    ? input.stations.filter(
        (station) => providerIdentityKey(input.registry.identify(station)) === currentIdentityKey
      )
    : [];
  const exactUrlRows = proposedUrl
    ? input.stations.filter((station) =>
        [station.source_url, station.validated_stream_url, station.embed_url]
          .map(comparableUrl)
          .includes(proposedUrl)
      )
    : [];
  const related = [...new Map(
    [input.station, ...exactIdentityRows, ...exactUrlRows].map((station) => [station.id, station])
  ).values()];
  const canonical = selectCanonicalStation(related) || input.station;
  const conflictingIdentity = exactUrlRows.some((station) => {
    const identity = input.registry.identify(station);
    return identity && currentIdentityKey && providerIdentityKey(identity) !== currentIdentityKey;
  });

  if (conflictingIdentity) {
    return {
      decision: "conflict",
      canonicalStationId: canonical.id,
      relatedStationIds: related.map((station) => station.id).sort(),
      reason: "source_url_owned_by_different_exact_provider_identity",
    };
  }
  if (related.length === 1) {
    return {
      decision: "unique",
      canonicalStationId: input.station.id,
      relatedStationIds: [input.station.id],
      reason: "no_exact_identity_or_source_duplicate",
    };
  }
  return {
    decision: canonical.id === input.station.id ? "canonical" : "duplicate_of",
    canonicalStationId: canonical.id,
    relatedStationIds: related.map((station) => station.id).sort(),
    reason: currentIdentityKey ? "exact_provider_identity_duplicate" : "exact_source_url_duplicate",
  };
}

function uniqueCurrentUrls(station: TvRecoveryStation) {
  const seen = new Set<string>();
  return [station.validated_stream_url, station.source_url, station.embed_url]
    .map((value) => String(value || "").trim())
    .filter((value) => {
      const key = comparableUrl(value);
      if (!value || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

const OUTCOME_PRIORITY: Record<DeepStreamProbeResult["outcome"], number> = {
  playable: 6,
  drm: 5,
  temporary: 4,
  dead: 3,
  unsupported: 2,
  invalid: 1,
};

async function probeCandidates(
  candidates: Array<{ url: string; providerCandidate?: TvProviderCandidate }>,
  station: TvRecoveryStation,
  probe: TvRecoveryProbe
) {
  let best: {
    url: string;
    providerCandidate?: TvProviderCandidate;
    probe: DeepStreamProbeResult;
  } | null = null;
  for (const candidate of candidates) {
    const result = await probe(candidate.url, station);
    const current = { ...candidate, probe: result };
    if (result.playable && result.streamIsHttps && result.stableUrl) return current;
    if (!best || OUTCOME_PRIORITY[result.outcome] > OUTCOME_PRIORITY[best.probe.outcome]) {
      best = current;
    }
  }
  return best;
}

function valuesEqual(left: unknown, right: unknown) {
  if (left === right) return true;
  if (left == null && right == null) return true;
  return false;
}

function mutationPatch(
  station: TvRecoveryStation,
  desired: TvRecoveryPatch,
  nowIso: string
): TvRecoveryPatch {
  const patch: TvRecoveryPatch = {};
  for (const [key, value] of Object.entries(desired) as Array<
    [keyof TvRecoveryPatch, TvRecoveryPatch[keyof TvRecoveryPatch]]
  >) {
    if (!valuesEqual(station[key as keyof TvRecoveryStation], value)) {
      (patch as Record<string, unknown>)[key] = value;
    }
  }
  if (Object.keys(patch).length > 0) patch.last_health_checked_at = nowIso;
  return patch;
}

function emptyValidation() {
  return {
    outcome: "not_run" as const,
    reason: "not_run",
    manifestValidated: false,
    mediaValidated: false,
  };
}

function proposedState(station: TvRecoveryStation, patch: TvRecoveryPatch) {
  return {
    playbackStatus: patch.playback_status ?? station.playback_status,
    active: patch.is_active ?? station.is_active,
    reliabilityScore: patch.reliability_score ?? station.reliability_score,
  };
}

function noChangePlan(input: {
  station: TvRecoveryStation;
  identity: TvProviderIdentity | null;
  duplicate: TvRecoveryDuplicateDecision;
  reason: string;
  action?: TvRecoveryPlan["action"];
}): TvRecoveryPlan {
  return {
    stationId: input.station.id,
    stationName: input.station.title,
    providerIdentity: input.identity,
    providerMetadata: null,
    currentSource: describeTvRecoverySource(
      input.station.validated_stream_url || input.station.source_url || input.station.embed_url
    ),
    proposedSource: null,
    currentState: {
      status: input.station.status,
      playbackStatus: input.station.playback_status,
      active: input.station.is_active,
      reliabilityScore: input.station.reliability_score,
    },
    proposedState: {
      playbackStatus: input.station.playback_status,
      active: input.station.is_active,
      reliabilityScore: input.station.reliability_score,
    },
    validation: emptyValidation(),
    duplicate: input.duplicate,
    drm: false,
    temporary: false,
    exactRecoveryReason: input.reason,
    action: input.action || "none",
    activationEligible: false,
    reviewChecks: {
      exactIdentity: input.identity !== null,
      duplicateSafe: ["unique", "canonical"].includes(input.duplicate.decision),
      canonicalRecord: input.duplicate.canonicalStationId === input.station.id,
      providerProvenance: false,
      playbackValidated: false,
      conflict: input.duplicate.decision === "conflict",
    },
    patch: {},
  };
}

export async function planTvStationRecovery(input: {
  station: TvRecoveryStation;
  allStations: TvRecoveryStation[];
  registry: TvRecoveryProviderRegistry;
  probe: TvRecoveryProbe;
  nowIso?: string;
  refreshProvider?: boolean;
}): Promise<TvRecoveryPlan> {
  const nowIso = input.nowIso || new Date().toISOString();
  const identity = input.registry.identify(input.station);
  const initialDuplicate = decideTvRecoveryDuplicate({
    station: input.station,
    stations: input.allStations,
    registry: input.registry,
  });
  if (["duplicate_of", "conflict"].includes(initialDuplicate.decision)) {
    return noChangePlan({
      station: input.station,
      identity,
      duplicate: initialDuplicate,
      reason: "duplicate_or_identity_conflict_preserved_for_review",
      action: "duplicate_suppressed",
    });
  }

  const current = await probeCandidates(
    uniqueCurrentUrls(input.station).map((url) => ({ url })),
    input.station,
    input.probe
  );
  let selected = current;
  let exactProviderValidated = false;
  let exactRecoveryReason = current?.probe.playable
    ? "current_source_media_validated"
    : "current_source_not_playable";

  const mustRefreshProvider =
    Boolean(identity) &&
    (input.refreshProvider === true || !current?.probe.playable || !input.station.is_active);
  if (identity && mustRefreshProvider) {
    const providerCandidates = await input.registry.resolveExact(identity);
    const providerResult = await probeCandidates(
      providerCandidates.map((candidate) => ({ url: candidate.sourceUrl, providerCandidate: candidate })),
      input.station,
      input.probe
    );
    if (providerResult?.probe.playable && providerResult.probe.streamIsHttps) {
      selected = providerResult;
      exactProviderValidated = true;
      exactRecoveryReason = current?.probe.playable
        ? input.station.is_active
          ? "current_source_refreshed_from_exact_provider"
          : "inactive_source_confirmed_by_exact_provider"
        : "stale_source_replaced_by_exact_provider_identity";
    } else if (!current?.probe.playable && providerResult) {
      selected = providerResult;
      exactRecoveryReason = "exact_provider_candidate_not_permanently_playable";
    } else if (!current?.probe.playable) {
      exactRecoveryReason = "exact_provider_identity_not_found_in_current_catalog";
    }
  } else if (!identity && !current?.probe.playable) {
    exactRecoveryReason = "no_exact_provider_identity_available";
  }

  const proposedUrl = selected?.providerCandidate?.sourceUrl || selected?.probe.stableUrl || null;
  const duplicate = decideTvRecoveryDuplicate({
    station: input.station,
    stations: input.allStations,
    registry: input.registry,
    proposedSourceUrl: proposedUrl,
  });
  if (["duplicate_of", "conflict"].includes(duplicate.decision)) {
    return noChangePlan({
      station: input.station,
      identity,
      duplicate,
      reason: "proposed_source_conflicts_with_existing_canonical_record",
      action: "duplicate_suppressed",
    });
  }

  const result = selected?.probe || null;
  const trulyPlayable = Boolean(result?.playable && result.streamIsHttps && result.stableUrl);
  let action: TvRecoveryPlan["action"] = "preserve_unresolved";
  let desired: TvRecoveryPatch = {};
  let activationEligible = false;

  if (trulyPlayable && result) {
    const stableSource = selected?.providerCandidate?.sourceUrl || result.stableUrl;
    const sourceChanged = Boolean(
      selected?.providerCandidate &&
      comparableUrl(stableSource) !== comparableUrl(input.station.source_url)
    );
    desired = {
      ...(sourceChanged && stableSource ? { source_url: stableSource } : {}),
      validated_stream_url: stableSource,
      playback_status: "playable",
      reliability_score: Math.max(60, Number(input.station.reliability_score || 0)),
      consecutive_failures: 0,
      last_health_error: null,
      last_validation_result: result.reason,
      ios_playable: true,
      android_playable: true,
      stream_protocol: result.protocol,
      stream_is_https: true,
      is_active: input.station.is_active,
      ...(input.station.is_active ? { quarantined_at: null, disabled_at: null } : {}),
    };
    if (!input.station.is_active) {
      action = "queue_inactive_review";
      activationEligible = Boolean(
        identity && exactProviderValidated && ["unique", "canonical"].includes(duplicate.decision)
      );
    } else if (sourceChanged) {
      action = "refresh_source";
    } else {
      action = "correct_health";
    }
  } else if (result?.outcome === "drm") {
    action = "classify_drm";
    desired = {
      playback_status: "blocked",
      validated_stream_url: null,
      last_health_error: result.reason,
      last_validation_result: result.reason,
      ios_playable: false,
      android_playable: false,
      stream_protocol: result.protocol,
      stream_is_https: result.streamIsHttps,
      is_active: input.station.is_active,
      quarantined_at: input.station.quarantined_at || nowIso,
    };
  } else if (result?.outcome === "temporary" || result?.finalUrlIsTemporary) {
    action = "classify_temporary";
    desired = {
      playback_status: "failed",
      validated_stream_url: null,
      last_health_error: result.reason,
      last_validation_result: "temporary_source",
      ios_playable: false,
      android_playable: false,
      stream_protocol: result.protocol,
      stream_is_https: result.streamIsHttps,
      is_active: input.station.is_active,
    };
  } else if (result) {
    desired = {
      playback_status: "failed",
      validated_stream_url: null,
      last_health_error: result.reason,
      last_validation_result: result.reason,
      ios_playable: false,
      android_playable: false,
      stream_protocol: result.protocol,
      stream_is_https: result.streamIsHttps,
      is_active: input.station.is_active,
      quarantined_at: input.station.quarantined_at || (input.station.is_active ? nowIso : null),
    };
  }

  const patch = mutationPatch(input.station, desired, nowIso);
  if (Object.keys(patch).length === 0 && action === "correct_health") action = "none";

  return {
    stationId: input.station.id,
    stationName: input.station.title,
    providerIdentity: identity,
    providerMetadata: selected?.providerCandidate
      ? { title: selected.providerCandidate.title, ...(selected.providerCandidate.metadata || {}) }
      : null,
    currentSource: describeTvRecoverySource(
      input.station.validated_stream_url || input.station.source_url || input.station.embed_url
    ),
    proposedSource: describeTvRecoverySource(proposedUrl),
    currentState: {
      status: input.station.status,
      playbackStatus: input.station.playback_status,
      active: input.station.is_active,
      reliabilityScore: input.station.reliability_score,
    },
    proposedState: proposedState(input.station, patch),
    validation: result
      ? {
          outcome: result.outcome,
          reason: result.reason,
          manifestValidated: result.manifestValidated,
          mediaValidated: result.mediaValidated,
        }
      : emptyValidation(),
    duplicate,
    drm: result?.drmDetected === true,
    temporary: result?.outcome === "temporary",
    exactRecoveryReason,
    action,
    activationEligible,
    reviewChecks: {
      exactIdentity: identity !== null,
      duplicateSafe: ["unique", "canonical"].includes(duplicate.decision),
      canonicalRecord: duplicate.canonicalStationId === input.station.id,
      providerProvenance: exactProviderValidated,
      playbackValidated: trulyPlayable,
      conflict: duplicate.decision === "conflict",
    },
    patch,
  };
}

export function toTvRecoveryDryRunRecord(plan: TvRecoveryPlan) {
  const safe: Partial<TvRecoveryPlan> = { ...plan };
  delete safe.patch;
  return safe as Omit<TvRecoveryPlan, "patch">;
}
