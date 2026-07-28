/**
 * Production Batch 2 expansion runner — multi-provider, checkpointed, publishes on playable.
 *
 * Usage (on VPS with .env.production loaded):
 *   npx tsx scripts/run-concerts-batch2-expansion.ts
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { getCuratedConcertSources } from "../lib/concerts/sourceRegistry";
import { listBatch2WaveSourceSeeds } from "../lib/concerts/expansion/batch2SourceWave";
import { upsertConcertSource } from "../lib/concerts/sourceRepository";
import { isConcertSourceImportEligible } from "../lib/concerts/import/sourceEligibility";
import { resolveYouTubeChannelIdFromPage } from "../lib/concerts/providers/youtubeRss";
import { discoverYouTubeChannelPageViaRss } from "../lib/concerts/providers/youtubeRss";
import { isValidYouTubeChannelId } from "../lib/concerts/providers/youtubeOfficial";
import { getKnownConcertYouTubeChannelId } from "../lib/concerts/providers/channelIdentityMap";
import { classifyConcertCandidate } from "../lib/concerts/import/classify";
import { buildHardProviderKey } from "../lib/concerts/import/dedupe";
import { validateConcertAppPlayback } from "../lib/concerts/playback/validatePlayback";
import { decideConcertCatalogueVisibility } from "../lib/concerts/playback/publish";
import { insertPendingConcertCandidate } from "../lib/concerts/import/persistPending";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import {
  discoverDailymotionUserVideos,
  discoverTwitchChannelVideos,
  discoverVimeoUserVideos,
} from "../lib/concerts/expansion/publicFeeds";
import { toConcertMediaCandidate, type ConcertMediaCandidate } from "../lib/concerts/candidate";
import type { ConcertSourceSeed } from "../lib/concerts/types";
import type { ConcertYouTubeVideoCandidate } from "../lib/concerts/providers/youtubeClient";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, "..");

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

loadEnvFile(path.join(adminRoot, ".env.local"));
loadEnvFile(path.join(adminRoot, ".env.production"));
loadEnvFile(path.join(adminRoot, ".env"));

type BatchReport = {
  started_at: string;
  finished_at?: string;
  sources_seeded: number;
  sources_total_eligible: number;
  sources_processed: number;
  identities_resolved_this_run: number;
  discovered: number;
  tested: number;
  published_new: number;
  rejected: number;
  duplicates: number;
  failed_sources: Array<{ key: string; error: string }>;
  by_provider: Record<string, number>;
};

function checkpointPath(stableKey: string) {
  return path.join(
    adminRoot,
    "data",
    "concert-batch2-checkpoints",
    `${stableKey}.json`
  );
}

function loadCp(stableKey: string): { last_ids: string[]; completed_at?: string } {
  const p = checkpointPath(stableKey);
  if (!fs.existsSync(p)) return { last_ids: [] };
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return { last_ids: [] };
  }
}

function saveCp(stableKey: string, data: { last_ids: string[]; completed_at?: string }) {
  const dir = path.dirname(checkpointPath(stableKey));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(checkpointPath(stableKey), JSON.stringify(data, null, 2));
}

async function resolveYtId(source: ConcertSourceSeed): Promise<string | null> {
  if (source.providerChannelId && isValidYouTubeChannelId(source.providerChannelId)) {
    return source.providerChannelId;
  }
  const known = getKnownConcertYouTubeChannelId(source.stableKey);
  if (known) return known;
  return resolveYouTubeChannelIdFromPage(source.mediaChannelUrl);
}

function ytToMedia(c: ConcertYouTubeVideoCandidate): ConcertMediaCandidate {
  return toConcertMediaCandidate({
    provider: "youtube",
    providerContentId: c.providerContentId,
    title: c.title,
    description: c.description,
    channelId: c.channelId,
    channelTitle: c.channelTitle,
    publishedAt: c.publishedAt,
    durationSeconds: c.durationSeconds,
    thumbnailUrl: c.thumbnailUrl,
    tags: c.tags,
    liveBroadcastContent: c.liveBroadcastContent,
    embeddable: c.embeddable,
    regionRestriction: c.regionRestriction,
    officialWatchUrl: c.officialWatchUrl,
    embedUrl: c.embedUrl,
    playbackMethod: "youtube_embed",
    countryCode: null,
    languageCode: null,
  });
}

async function discoverForSource(
  source: ConcertSourceSeed
): Promise<{ candidates: ConcertMediaCandidate[]; resolvedId: string | null }> {
  if (source.provider === "youtube") {
    const id = await resolveYtId(source);
    if (!id) return { candidates: [], resolvedId: null };
    const page = await discoverYouTubeChannelPageViaRss({ channelId: id });
    return { candidates: page.candidates.map(ytToMedia), resolvedId: id };
  }
  if (source.provider === "vimeo") {
    const candidates = await discoverVimeoUserVideos({
      mediaChannelUrl: source.mediaChannelUrl,
      max: 25,
    });
    return { candidates, resolvedId: source.mediaChannelUrl };
  }
  if (source.provider === "dailymotion") {
    const candidates = await discoverDailymotionUserVideos({
      mediaChannelUrl: source.mediaChannelUrl,
      max: 25,
    });
    return { candidates, resolvedId: source.mediaChannelUrl };
  }
  if (source.provider === "twitch") {
    const candidates = await discoverTwitchChannelVideos({
      mediaChannelUrl: source.mediaChannelUrl,
      max: 25,
    });
    return { candidates, resolvedId: source.mediaChannelUrl };
  }
  return { candidates: [], resolvedId: null };
}

async function ensureSourceId(stableKey: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("concert_sources")
    .select("id")
    .eq("stable_key", stableKey)
    .maybeSingle();
  return data?.id ? String(data.id) : null;
}

async function publishItem(
  concertItemId: string,
  candidate: ConcertMediaCandidate,
  classification: ReturnType<typeof classifyConcertCandidate>
) {
  const publish = decideConcertCatalogueVisibility({
    playable: true,
    isLive: classification.isLive,
    isUpcoming: classification.isUpcoming,
    isReplay: classification.isReplay,
  });
  await supabaseAdmin
    .from("concert_items")
    .update({
      is_public: publish.isPublic,
      visibility_status: publish.visibilityStatus,
      playback_status: publish.playbackStatus,
      rights_status: publish.rightsStatus,
      published_at: publish.publishedAt,
      last_verified_at: new Date().toISOString(),
      health_score: 55,
    })
    .eq("id", concertItemId);

  await supabaseAdmin
    .from("concert_streams")
    .update({
      playback_status: "playable",
      last_verified_at: new Date().toISOString(),
      playback_method: candidate.playbackMethod,
      app_embed_url: candidate.embedUrl,
      app_stream_url: candidate.streamUrl,
      last_playback_validation_ok: true,
      last_playback_validation_at: new Date().toISOString(),
    })
    .eq("concert_item_id", concertItemId);
}

async function main() {
  const report: BatchReport = {
    started_at: new Date().toISOString(),
    sources_seeded: 0,
    sources_total_eligible: 0,
    sources_processed: 0,
    identities_resolved_this_run: 0,
    discovered: 0,
    tested: 0,
    published_new: 0,
    rejected: 0,
    duplicates: 0,
    failed_sources: [],
    by_provider: {},
  };

  const curated = getCuratedConcertSources();
  const wave = listBatch2WaveSourceSeeds();
  const byKey = new Map<string, ConcertSourceSeed>();
  for (const s of [...curated, ...wave]) byKey.set(s.stableKey, s);
  const all = [...byKey.values()];

  for (const source of all) {
    try {
      await upsertConcertSource(source);
      report.sources_seeded += 1;
    } catch (error) {
      report.failed_sources.push({
        key: source.stableKey,
        error: `seed:${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  const eligible = all.filter(isConcertSourceImportEligible);
  report.sources_total_eligible = eligible.length;

  const seenHard = new Set<string>();

  for (const source of eligible) {
    report.sources_processed += 1;
    const cp = loadCp(source.stableKey);
    const knownIds = new Set(cp.last_ids || []);

    try {
      const { candidates, resolvedId } = await discoverForSource(source);
      if (resolvedId && source.provider === "youtube" && isValidYouTubeChannelId(resolvedId)) {
        report.identities_resolved_this_run += 1;
        await supabaseAdmin
          .from("concert_sources")
          .update({ provider_channel_id: resolvedId })
          .eq("stable_key", source.stableKey);
      }

      const sourceId = await ensureSourceId(source.stableKey);
      if (!sourceId) {
        report.failed_sources.push({ key: source.stableKey, error: "source_id_missing" });
        continue;
      }

      const newIds: string[] = [...knownIds];

      for (const candidate of candidates) {
        report.discovered += 1;
        report.by_provider[candidate.provider] =
          (report.by_provider[candidate.provider] || 0) + 1;

        const hard = buildHardProviderKey(
          candidate.provider,
          candidate.providerContentId
        );
        if (seenHard.has(hard) || knownIds.has(candidate.providerContentId)) {
          report.duplicates += 1;
          continue;
        }
        seenHard.add(hard);

        const classification = classifyConcertCandidate(candidate);
        if (classification.decision !== "accept_candidate") {
          report.rejected += 1;
          continue;
        }

        report.tested += 1;
        const validation = await validateConcertAppPlayback(candidate);
        if (!validation.playable) {
          report.rejected += 1;
          continue;
        }

        // Map generic candidate into pending insert shape for YouTube path;
        // for non-YouTube, insert via streams payload helper below.
        if (candidate.provider === "youtube") {
          const ytCandidate: ConcertYouTubeVideoCandidate = {
            provider: "youtube",
            providerContentId: candidate.providerContentId,
            title: candidate.title,
            description: candidate.description,
            channelId: candidate.channelId || resolvedId || "",
            channelTitle: candidate.channelTitle || source.name,
            publishedAt: candidate.publishedAt,
            durationSeconds: candidate.durationSeconds,
            thumbnailUrl: candidate.thumbnailUrl,
            tags: candidate.tags,
            liveBroadcastContent: candidate.liveBroadcastContent,
            embedHtmlPresent: Boolean(candidate.embedUrl),
            embeddable: candidate.embeddable,
            regionRestriction: candidate.regionRestriction,
            officialWatchUrl: candidate.officialWatchUrl,
            embedUrl: candidate.embedUrl,
          };
          const inserted = await insertPendingConcertCandidate({
            sourceId,
            candidate: ytCandidate,
            classification,
            countryCode: source.countryCode,
            languageCode: source.languageCodes[0] || null,
          });
          if (inserted.duplicate) {
            report.duplicates += 1;
            continue;
          }
          if (inserted.inserted && inserted.concertItemId) {
            await publishItem(inserted.concertItemId, candidate, classification);
            report.published_new += 1;
            newIds.push(candidate.providerContentId);
          }
        } else {
          // Non-YouTube upsert via direct tables
          const dedupeKey = `${candidate.provider}:${candidate.providerContentId}`;
          const itemPayload = {
            source_id: sourceId,
            source_item_id: candidate.providerContentId,
            title: candidate.title,
            normalized_title: candidate.title.toLowerCase(),
            description: candidate.description || null,
            primary_artist_name: candidate.channelTitle || source.name,
            normalized_primary_artist: (candidate.channelTitle || source.name).toLowerCase(),
            concert_type: classification.concertType,
            artwork_url: candidate.thumbnailUrl,
            official_page_url: candidate.officialWatchUrl,
            duration_seconds: candidate.durationSeconds,
            is_live: classification.isLive,
            is_upcoming: classification.isUpcoming,
            is_replay: classification.isReplay,
            is_free: true,
            is_public: false,
            is_mature: false,
            visibility_status: "validation_pending",
            rights_status: "pending_review",
            playback_status: "validation_pending",
            health_score: 0,
            country_code: source.countryCode,
            language_code: source.languageCodes[0] || null,
            dedupe_key: dedupeKey,
          };
          const { data: item, error: itemError } = await supabaseAdmin
            .from("concert_items")
            .upsert(itemPayload, { onConflict: "source_id,source_item_id" })
            .select("id")
            .single();
          if (itemError) {
            if (/duplicate|unique/i.test(itemError.message)) {
              report.duplicates += 1;
              continue;
            }
            throw new Error(itemError.message);
          }
          await supabaseAdmin.from("concert_streams").upsert(
            {
              concert_item_id: item.id,
              provider: candidate.provider,
              provider_content_id: candidate.providerContentId,
              embed_url: candidate.embedUrl,
              official_watch_url: candidate.officialWatchUrl,
              stream_type:
                candidate.playbackMethod === "hls"
                  ? "hls"
                  : candidate.playbackMethod === "dash"
                    ? "dash"
                    : "embed",
              embeddable: true,
              playback_status: "validation_pending",
              is_canonical_stream: true,
            },
            { onConflict: "provider,provider_content_id" }
          );
          await publishItem(String(item.id), candidate, classification);
          report.published_new += 1;
          newIds.push(candidate.providerContentId);
        }
      }

      saveCp(source.stableKey, {
        last_ids: Array.from(new Set(newIds)).slice(-500),
        completed_at: new Date().toISOString(),
      });
    } catch (error) {
      report.failed_sources.push({
        key: source.stableKey,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  report.finished_at = new Date().toISOString();
  const outPath = path.join(adminRoot, "data", "concerts-batch2-report.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
