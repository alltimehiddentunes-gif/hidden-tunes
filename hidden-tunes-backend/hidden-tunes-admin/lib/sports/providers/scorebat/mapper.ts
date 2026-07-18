/**
 * Map ScoreBat feed records → canonical football fixtures (provider-internal).
 */

import { validateScoreBatEmbed } from "./embedSafety";
import {
  classifyScoreBatLifecycle,
  classifyScoreBatVideoTitle,
} from "./lifecycle";
import {
  competitionSlugFromName,
  countryFromCompetitionLabel,
  normalizeFootballName,
  parseHomeAwayFromTitle,
} from "./normalize";
import type {
  CanonicalScoreBatMatch,
  ScoreBatMatch,
  ScoreBatVideoClass,
} from "./types";
import { SCOREBAT_PROVIDER_SLUG } from "./config";

function hashKey(parts: string[]): string {
  const raw = parts.join("|");
  let h = 2166136261;
  for (let i = 0; i < raw.length; i += 1) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `sb${(h >>> 0).toString(16)}`;
}

function teamFrom(
  team: ScoreBatMatch["homeTeam"],
  fallbackName: string | null
): CanonicalScoreBatMatch["homeTeam"] {
  const name = String(team?.name || fallbackName || "").trim();
  if (!name) return null;
  return {
    name,
    slug: team?.slug ? String(team.slug) : null,
    externalId:
      team?.id != null
        ? String(team.id)
        : team?.slug
          ? `slug:${team.slug}`
          : null,
  };
}

function primaryVideoClass(
  classes: ScoreBatVideoClass[]
): ScoreBatVideoClass {
  if (classes.includes("live")) return "live";
  if (classes.includes("replay")) return "replay";
  if (classes.includes("highlights")) return "highlights";
  if (classes.includes("starting_soon")) return "starting_soon";
  return classes[0] || "other";
}

export function mapScoreBatMatchToCanonical(
  match: ScoreBatMatch,
  opts: { now?: Date; isFixture?: boolean } = {}
): CanonicalScoreBatMatch | null {
  const title = String(match.title || "").trim();
  if (!title) return null;

  const startsAtRaw = String(match.date || "").trim();
  const startsMs = Date.parse(startsAtRaw);
  if (!Number.isFinite(startsMs)) return null;

  const startsAt = new Date(startsMs).toISOString();
  const parsed = parseHomeAwayFromTitle(title);
  const home = teamFrom(match.homeTeam, parsed.home);
  const away = teamFrom(match.awayTeam, parsed.away);

  const competitionName = String(match.competition || "").trim() || "Football";
  const videosIn = Array.isArray(match.videos) ? match.videos : [];
  const mappedVideos: CanonicalScoreBatMatch["videos"] = [];
  let invalidEmbed = false;

  for (const v of videosIn) {
    const vTitle = String(v.title || "").trim() || "Video";
    const validated = validateScoreBatEmbed(String(v.embed || ""));
    if (!validated.ok) {
      invalidEmbed = true;
      mappedVideos.push({
        id: v.id ? String(v.id) : null,
        title: vTitle,
        videoClass: classifyScoreBatVideoTitle(vTitle),
        embedUrl: null,
      });
      continue;
    }
    mappedVideos.push({
      id: v.id ? String(v.id) : null,
      title: vTitle,
      videoClass: classifyScoreBatVideoTitle(vTitle),
      embedUrl: validated.embedUrl,
    });
  }

  // Reject match if it has embeds but none validated.
  if (videosIn.length > 0 && mappedVideos.every((v) => !v.embedUrl)) {
    return {
      providerSlug: SCOREBAT_PROVIDER_SLUG,
      providerNativeId: "",
      canonicalKey: "",
      title,
      competitionName,
      competitionSlug: competitionSlugFromName(competitionName),
      countryCode: countryFromCompetitionLabel(competitionName),
      homeTeam: home,
      awayTeam: away,
      startsAt,
      thumbnailUrl: match.thumbnail || null,
      videoClass: "other",
      lifecycle: "discovered",
      primaryVideoId: null,
      embedUrl: null,
      videos: mappedVideos,
      sourceUpdatedAt: new Date().toISOString(),
      isFixture: Boolean(opts.isFixture),
      rejectReason: invalidEmbed ? "invalid_embeds" : "no_valid_embed",
    };
  }

  const classes = mappedVideos.map((v) => v.videoClass);
  const videoClass = primaryVideoClass(classes);
  const lifecycle = classifyScoreBatLifecycle({
    startsAt,
    videoTitles: mappedVideos.map((v) => v.title),
    now: opts.now,
  });

  const primary =
    mappedVideos.find((v) => v.videoClass === "live" && v.embedUrl) ||
    mappedVideos.find((v) => v.embedUrl) ||
    null;

  const homeNorm = normalizeFootballName(home?.name || "");
  const awayNorm = normalizeFootballName(away?.name || "");
  const nativeId = hashKey([
    competitionSlugFromName(competitionName) || competitionName,
    homeNorm,
    awayNorm,
    startsAt,
    primary?.id || title,
  ]);

  return {
    providerSlug: SCOREBAT_PROVIDER_SLUG,
    providerNativeId: nativeId,
    canonicalKey: `scorebat:fixture:${nativeId}`,
    title,
    competitionName,
    competitionSlug: competitionSlugFromName(competitionName),
    countryCode: countryFromCompetitionLabel(competitionName),
    homeTeam: home,
    awayTeam: away,
    startsAt,
    thumbnailUrl: match.thumbnail || null,
    videoClass,
    lifecycle,
    primaryVideoId: primary?.id || null,
    embedUrl: primary?.embedUrl || null,
    videos: mappedVideos,
    sourceUpdatedAt: new Date().toISOString(),
    isFixture: Boolean(opts.isFixture),
  };
}

export function mapScoreBatMatches(
  matches: ScoreBatMatch[],
  opts: { now?: Date; maxItems?: number } = {}
): {
  accepted: CanonicalScoreBatMatch[];
  rejected: Array<{ title: string; reason: string }>;
} {
  const limit = opts.maxItems ?? 100;
  const accepted: CanonicalScoreBatMatch[] = [];
  const rejected: Array<{ title: string; reason: string }> = [];
  const seen = new Set<string>();

  for (const match of matches.slice(0, limit)) {
    const mapped = mapScoreBatMatchToCanonical(match, {
      now: opts.now,
      isFixture: Boolean((match as { __fixture?: boolean }).__fixture),
    });
    if (!mapped) {
      rejected.push({
        title: String(match.title || ""),
        reason: "unmappable",
      });
      continue;
    }
    if (mapped.rejectReason) {
      rejected.push({ title: mapped.title, reason: mapped.rejectReason });
      continue;
    }
    if (seen.has(mapped.canonicalKey)) {
      rejected.push({ title: mapped.title, reason: "duplicate" });
      continue;
    }
    seen.add(mapped.canonicalKey);
    accepted.push(mapped);
  }

  return { accepted, rejected };
}
