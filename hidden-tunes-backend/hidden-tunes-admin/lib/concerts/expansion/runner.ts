/**
 * Multi-provider expansion runner toward 25,000 playable items.
 * Batched, checkpointed, memory-bounded. One provider failure does not stop the run.
 * Does not invent playable counts — only measured outcomes.
 */

import path from "path";
import fs from "fs";

import type { ConcertMediaCandidate } from "../candidate";
import { classifyConcertCandidate } from "../import/classify";
import { buildHardProviderKey } from "../import/dedupe";
import { validateConcertAppPlayback } from "../playback/validatePlayback";
import { decideConcertCatalogueVisibility } from "../playback/publish";
import { decideConcertCleanAction } from "../playback/catalogueCleaner";
import {
  buildConcertScaleProgress,
  bumpCount,
  emptyConcertScaleCounters,
  type ConcertScaleProgressReport,
} from "./progress";
import {
  listWorldwideConcertDiscoverySeeds,
  type ConcertDiscoverySeed,
} from "./worldwideSources";
import { resolveConcertProviderAdapter } from "../providers/adapters";
import { toConcertMediaCandidate } from "../candidate";

export type ConcertExpansionRunOptions = {
  seeds?: ConcertDiscoverySeed[];
  fixtures?: ConcertMediaCandidate[];
  dryRun?: boolean;
  skipNetworkValidation?: boolean;
  batchSize?: number;
  adminRoot?: string;
  targetPlayable?: number;
};

export type ConcertExpansionRunReport = {
  dryRun: boolean;
  seedsProcessed: number;
  providerFailures: Record<string, string>;
  progress: ConcertScaleProgressReport;
  publishDecisions: {
    public: number;
    hidden: number;
  };
  cleaned: number;
};

function checkpointPath(adminRoot: string) {
  return path.join(adminRoot, "data", "concert-expansion-checkpoints", "progress.json");
}

export async function runConcertsExpansion(
  options: ConcertExpansionRunOptions = {}
): Promise<ConcertExpansionRunReport> {
  const dryRun = options.dryRun !== false; // default dry-run safe
  const skipNetwork = options.skipNetworkValidation === true || Boolean(options.fixtures);
  const batchSize = Math.max(1, options.batchSize || 50);
  const seeds = options.seeds || listWorldwideConcertDiscoverySeeds();
  const counters = emptyConcertScaleCounters();
  const providerFailures: Record<string, string> = {};
  let publishPublic = 0;
  let publishHidden = 0;
  let cleaned = 0;

  const seenHard = new Set<string>();
  const fixtures = options.fixtures || [];

  // Process fixture candidates in memory-bounded batches (no full catalogue load).
  for (let offset = 0; offset < fixtures.length; offset += batchSize) {
    const batch = fixtures.slice(offset, offset + batchSize);
    for (const raw of batch) {
      counters.discovered += 1;
      bumpCount(counters.byProvider, raw.provider);
      bumpCount(counters.byCountry, raw.countryCode);
      bumpCount(counters.byLanguage, raw.languageCode);

      const adapter = resolveConcertProviderAdapter(
        raw.embedUrl || raw.streamUrl || raw.officialWatchUrl || raw.providerContentId,
        raw.provider
      );
      if (!adapter) {
        providerFailures[raw.provider] = "adapter_missing";
        counters.failed += 1;
        continue;
      }

      const playback = adapter.resolvePlayback({
        contentId: raw.providerContentId,
        watchUrl: raw.officialWatchUrl,
        embedUrl: raw.embedUrl,
        streamUrl: raw.streamUrl,
      });
      const candidate = toConcertMediaCandidate({
        ...raw,
        embedUrl: playback.embedUrl || raw.embedUrl,
        streamUrl: playback.streamUrl || raw.streamUrl,
        playbackMethod: playback.method,
      });

      const classification = classifyConcertCandidate(candidate);

      if (classification.decision !== "accept_candidate") {
        counters.failed += 1;
        continue;
      }

      const hard = buildHardProviderKey(candidate.provider, candidate.providerContentId);
      if (seenHard.has(hard)) {
        counters.duplicates += 1;
        cleaned += 1;
        continue;
      }
      seenHard.add(hard);
      counters.imported += 1;
      bumpCount(counters.byCategory, classification.concertType);

      counters.tested += 1;
      const validation = await validateConcertAppPlayback(candidate, {
        skipNetwork,
      });
      const publish = decideConcertCatalogueVisibility({
        playable: validation.playable,
        isLive: classification.isLive,
        isUpcoming: classification.isUpcoming,
        isReplay: classification.isReplay,
        privateOrRemoved: validation.signals.removed_or_private === true,
        fakeLive: validation.signals.fake_live_loop === true,
      });
      const clean = decideConcertCleanAction({
        playable: validation.playable,
        privateOrRemoved: validation.signals.removed_or_private === true,
        fakeLive: validation.signals.fake_live_loop === true,
        brokenEmbed: validation.signals.embed_allowed === false,
        duplicateExact: false,
      });

      if (clean.action !== "keep_public") cleaned += 1;

      if (publish.isPublic && validation.playable) {
        publishPublic += 1;
        counters.playable += 1;
        if (classification.isLive) counters.currentlyLive += 1;
        else if (classification.isUpcoming) counters.upcoming += 1;
        else counters.replay += 1;
      } else {
        publishHidden += 1;
        if (!validation.playable) counters.failed += 1;
        if (publish.visibilityStatus === "quarantined") counters.quarantined += 1;
      }
    }
  }

  // Seed pass — record discovery coverage; live provider pagination is adapter-driven.
  let seedsProcessed = 0;
  for (const seed of seeds) {
    seedsProcessed += 1;
    bumpCount(counters.byProvider, seed.provider);
    bumpCount(counters.byCountry, seed.countryCode);
    for (const lang of seed.languageCodes) bumpCount(counters.byLanguage, lang);
    bumpCount(counters.byCategory, seed.category);
    try {
      const adapter = resolveConcertProviderAdapter(seed.discoveryUrl, seed.provider);
      if (!adapter) {
        providerFailures[seed.provider] = providerFailures[seed.provider] || "adapter_missing";
      }
    } catch (error) {
      providerFailures[seed.stableKey] =
        error instanceof Error ? error.message : "seed_failure";
    }
  }

  const progress = buildConcertScaleProgress(counters, [
    dryRun ? "dry_run=true — no production catalogue writes" : "write_mode",
    skipNetwork
      ? "network_validation_skipped_for_fixtures"
      : "network_validation_enabled",
    `seeds=${seedsProcessed}`,
    `fixture_candidates=${fixtures.length}`,
  ]);

  if (options.adminRoot) {
    const out = checkpointPath(options.adminRoot);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(
      out,
      JSON.stringify(
        {
          updatedAt: new Date().toISOString(),
          dryRun,
          progress,
          providerFailures,
        },
        null,
        2
      )
    );
  }

  return {
    dryRun,
    seedsProcessed,
    providerFailures,
    progress,
    publishDecisions: { public: publishPublic, hidden: publishHidden },
    cleaned,
  };
}
