/**
 * Bounded ScoreBat import — dry-run by default. No writes unless explicitly applied
 * AND sports_provider_imports_enabled + ScoreBat discovery flags are on.
 */

import { isSportsFeatureEnabled } from "../featureFlags";
import { redactSecrets } from "../http";
import { createScoreBatAdapter } from "../providers/scorebat/adapter";
import { discoverScoreBatMatches } from "../providers/scorebat/client";
import {
  getScoreBatRuntimeConfig,
  SCOREBAT_PROVIDER_SLUG,
  scoreBatTokenPresentLabel,
} from "../providers/scorebat/config";
import {
  isScoreBatDiscoveryPaused,
  recordScoreBatDiscoveryFailure,
  recordScoreBatDiscoverySuccess,
} from "../providers/scorebat/health";
import { mapScoreBatMatches } from "../providers/scorebat/mapper";
import { matchScoreBatToExistingFixtures } from "../providers/scorebat/matching";
import type { CanonicalScoreBatMatch } from "../providers/scorebat/types";

export type ScoreBatImportReport = {
  provider: typeof SCOREBAT_PROVIDER_SLUG;
  dryRun: boolean;
  token: "present" | "absent";
  source: string;
  endpoint: string;
  limit: number;
  discovered: number;
  accepted: number;
  rejected: number;
  matched: number;
  potentialNewFixtures: number;
  potentialBroadcasts: number;
  live: number;
  startingSoon: number;
  finished: number;
  highlights: number;
  replays: number;
  duplicates: number;
  ambiguous: number;
  invalidEmbeds: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
  notes: string[];
  rejectedSamples: Array<{ title: string; reason: string }>;
  durationMs: number;
};

function countBy(
  items: CanonicalScoreBatMatch[],
  pred: (m: CanonicalScoreBatMatch) => boolean
): number {
  return items.filter(pred).length;
}

/**
 * Dry-run is always safe. Apply path refuses writes in Phase 3A unless
 * explicitly enabled later — currently apply still reports only (no mass import).
 */
export async function importScoreBatProvider(input: {
  dryRun?: boolean;
  limit?: number;
  useFixtures?: boolean;
  allowLive?: boolean;
  /** Injected existing fixtures for matching tests. */
  existingFixtures?: Array<{
    id: string;
    providerExternalId?: string | null;
    startsAt: string;
    homeName?: string | null;
    awayName?: string | null;
  }>;
}): Promise<ScoreBatImportReport> {
  const started = Date.now();
  const dryRun = input.dryRun !== false; // default true
  const cfg = getScoreBatRuntimeConfig();
  const limit = Math.min(100, Math.max(1, input.limit ?? cfg.maxItems));

  const report: ScoreBatImportReport = {
    provider: SCOREBAT_PROVIDER_SLUG,
    dryRun,
    token: scoreBatTokenPresentLabel(),
    source: "none",
    endpoint: "",
    limit,
    discovered: 0,
    accepted: 0,
    rejected: 0,
    matched: 0,
    potentialNewFixtures: 0,
    potentialBroadcasts: 0,
    live: 0,
    startingSoon: 0,
    finished: 0,
    highlights: 0,
    replays: 0,
    duplicates: 0,
    ambiguous: 0,
    invalidEmbeds: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    notes: [],
    rejectedSamples: [],
    durationMs: 0,
  };

  if (isScoreBatDiscoveryPaused()) {
    report.errors.push("discovery_paused_after_failures");
    report.notes.push("Kill/pause active — no discovery.");
    report.durationMs = Date.now() - started;
    return report;
  }

  const importsEnabled = await isSportsFeatureEnabled(
    "sports_provider_imports_enabled"
  );
  if (!dryRun && !importsEnabled) {
    report.errors.push("imports_disabled");
    report.notes.push(
      "Apply refused: sports_provider_imports_enabled is false."
    );
    report.dryRun = true;
  }

  try {
    createScoreBatAdapter({
      enabled: cfg.enabled,
      killSwitch: cfg.killSwitch,
    });

    const discovered = await discoverScoreBatMatches({
      useFixtures: input.useFixtures ?? true,
      maxItems: limit,
      allowLive: Boolean(input.allowLive) && report.token === "present",
    });

    report.source = discovered.source;
    report.endpoint = discovered.endpoint;
    report.discovered = discovered.items.length;
    if (discovered.error) report.errors.push(discovered.error);

    const { accepted, rejected } = mapScoreBatMatches(discovered.items, {
      maxItems: limit,
    });
    report.accepted = accepted.length;
    report.rejected = rejected.length;
    report.rejectedSamples = rejected.slice(0, 10);
    report.duplicates = rejected.filter((r) => r.reason === "duplicate").length;
    report.invalidEmbeds = rejected.filter((r) =>
      r.reason.includes("embed")
    ).length;

    report.live = countBy(
      accepted,
      (m) => m.lifecycle === "live" || m.videoClass === "live"
    );
    report.startingSoon = countBy(
      accepted,
      (m) => m.lifecycle === "starting_soon"
    );
    report.finished = countBy(
      accepted,
      (m) =>
        m.lifecycle === "finished" ||
        m.lifecycle === "hibernating" ||
        m.lifecycle === "highlights" ||
        m.lifecycle === "replay"
    );
    report.highlights = countBy(
      accepted,
      (m) => m.videoClass === "highlights" || m.lifecycle === "highlights"
    );
    report.replays = countBy(
      accepted,
      (m) => m.videoClass === "replay" || m.lifecycle === "replay"
    );

    const existing = input.existingFixtures || [];
    for (const item of accepted) {
      const decision = matchScoreBatToExistingFixtures(item, existing);
      if (decision.kind === "exact_external" || decision.kind === "kickoff_pair") {
        report.matched += 1;
      } else if (decision.kind === "ambiguous") {
        report.ambiguous += 1;
        report.notes.push(
          `ambiguous:${item.title}:${decision.candidateIds.join(",")}`
        );
      } else {
        report.potentialNewFixtures += 1;
      }
      if (item.embedUrl) report.potentialBroadcasts += 1;
    }

    // Phase 3A: never write on dry-run; apply also blocked (no mass import).
    if (!dryRun && importsEnabled && cfg.discoveryEnabled && cfg.enabled) {
      report.notes.push(
        "Apply mode recognized but Phase 3A refuses production writes — use dry-run inventory only."
      );
      report.skipped = accepted.length;
    } else {
      report.notes.push(
        dryRun
          ? "Dry-run: no database writes."
          : "Writes skipped (flags off or Phase 3A guard)."
      );
      report.skipped = accepted.length;
    }

    recordScoreBatDiscoverySuccess({
      fetched: report.discovered,
      accepted: report.accepted,
      rejected: report.rejected,
      responseMs: discovered.durationMs,
    });
  } catch (err) {
    recordScoreBatDiscoveryFailure();
    report.errors.push(err instanceof Error ? err.message : String(err));
  }

  report.durationMs = Date.now() - started;
  return redactSecrets(report) as ScoreBatImportReport;
}
