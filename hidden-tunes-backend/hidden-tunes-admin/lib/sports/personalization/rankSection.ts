/**
 * Section-aware personalization ranking pipeline.
 */

import type {
  SportsCompetitionCard,
  SportsCountryCard,
  SportsHomeSectionId,
  SportsMatchCard,
  SportsVideoCard,
  SportsWorldCard,
} from "../home/types";
import { applyDiscoveryBalance } from "./applyDiscoveryBalance";
import { profileHasSignals } from "./profileHelpers";
import { dedupeByTieKey, rankItems, takeBounded } from "./rankItems";
import { scoreCompetition } from "./scoreCompetition";
import { boundMatchScoreTotal, scoreMatchCard } from "./scoreMatchCard";
import { scoreCountry, scoreSport } from "./scoreSport";
import type {
  ScoredItem,
  SportsPreferenceProfile,
  SportsRecommendationReason,
} from "./types";
import {
  SPORTS_PERSONALIZATION_BOUNDS,
  SPORTS_SECTION_DISCOVERY,
} from "./weights";

export type RankSectionOptions = {
  sectionId: SportsHomeSectionId;
  profile: SportsPreferenceProfile | null;
  personalizationEnabled: boolean;
  now?: Date;
  limit?: number;
  /** Attach safe recommendation reasons onto match cards. */
  attachReasons?: boolean;
};

function scheduleGroup(card: SportsMatchCard): number {
  if (card.status.live) return 0;
  if (card.status.code === "starting_soon") return 1;
  if (card.status.finished) return 3;
  return 2; // later today / scheduled
}

function editorialTier(card: SportsMatchCard): number {
  if (card.badges?.includes("featured")) return 0;
  return 1;
}

function asMatchCards(items: unknown[]): SportsMatchCard[] {
  return items as SportsMatchCard[];
}

export function rankMatchSection(
  items: ReadonlyArray<SportsMatchCard>,
  options: RankSectionOptions
): SportsMatchCard[] {
  const source = items.slice(
    0,
    SPORTS_PERSONALIZATION_BOUNDS.maxCandidatesPerSection
  );
  const limit = options.limit ?? source.length;
  const enabled =
    options.personalizationEnabled && profileHasSignals(options.profile);
  const neutral = !enabled;

  if (options.sectionId === "continue_watching") {
    // Resume order dominates — do not preference-reorder or inject discovery.
    return takeBounded([...source], limit);
  }

  if (options.sectionId === "trending") {
    // Trend-led: leave loader order (empty when no signals in Phase 2B).
    return takeBounded([...source], limit);
  }

  const scored: ScoredItem<SportsMatchCard>[] = source.map((card) => {
    const { score, reason } = scoreMatchCard(card, {
      profile: options.profile,
      now: options.now,
      neutral,
    });

    let total = boundMatchScoreTotal(score.total);
    const startsAtMs = card.timing.startsAt
      ? Date.parse(card.timing.startsAt)
      : Number.POSITIVE_INFINITY;

    if (options.sectionId === "featured") {
      const tier = editorialTier(card);
      const withinTier = neutral
        ? score.editorialPriority + score.globalImportance + score.freshness
        : total;
      total = (1 - tier) * 10_000 + withinTier;
    }

    if (options.sectionId === "starting_soon" && Number.isFinite(startsAtMs)) {
      const hoursUntil = Math.max(
        0,
        (startsAtMs - (options.now ?? new Date()).getTime()) / 3_600_000
      );
      // Sooner start wins heavily; preference is secondary.
      total = Math.max(0, 500 - hoursUntil * 80) + total * 0.35;
    }

    let group = 0;
    if (options.sectionId === "todays_schedule") {
      group = scheduleGroup(card);
      total = (3 - group) * 10_000 + total;
    }

    return {
      item: card,
      score: total,
      breakdown: score,
      reason,
      tieKey: card.id,
      editorialTier: editorialTier(card),
      scheduleGroup: group,
      startsAtMs: Number.isFinite(startsAtMs) ? startsAtMs : undefined,
    };
  });

  let ordered: ScoredItem<SportsMatchCard>[];
  const mix = SPORTS_SECTION_DISCOVERY[options.sectionId];

  if (options.sectionId === "todays_schedule") {
    // Personalize within each schedule group, then concat.
    const groups = new Map<number, ScoredItem<SportsMatchCard>[]>();
    for (const row of scored) {
      const g = row.scheduleGroup ?? 2;
      const list = groups.get(g) || [];
      list.push(row);
      groups.set(g, list);
    }
    ordered = [];
    for (const g of [0, 1, 2, 3]) {
      const list = groups.get(g) || [];
      if (!list.length) continue;
      const mixed =
        mix && typeof mix === "object"
          ? applyDiscoveryBalance(list, {
              preferencePerTen: mix.preferencePerTen,
              discoveryPerTen: mix.discoveryPerTen,
            })
          : rankItems(list);
      ordered.push(...mixed);
    }
  } else if (mix === "none" || mix === "trend" || mix === "editorial") {
    ordered = rankItems(dedupeByTieKey(scored));
  } else if (typeof mix === "object") {
    ordered = applyDiscoveryBalance(scored, {
      preferencePerTen: Math.floor(mix.preferencePerTen),
      discoveryPerTen: Math.ceil(mix.discoveryPerTen),
    });
  } else {
    ordered = rankItems(dedupeByTieKey(scored));
  }

  // Because You Follow: avoid duplicating first continue-watching item when possible.
  if (
    options.sectionId === "because_you_follow" &&
    options.profile?.continueWatchingFixtureIds.size
  ) {
    const cwFirst = [...options.profile.continueWatchingFixtureIds][0];
    if (cwFirst && ordered.length > 1 && ordered[0].tieKey === cwFirst) {
      const [first, ...rest] = ordered;
      ordered = [...rest, first];
    }
  }

  const limited = takeBounded(ordered, limit);
  return limited.map((row) => {
    if (!options.attachReasons || !row.reason) return row.item;
    return {
      ...row.item,
      recommendationReason: row.reason,
    } as SportsMatchCard & {
      recommendationReason?: SportsRecommendationReason;
    };
  });
}

export function rankCompetitionSection(
  items: ReadonlyArray<SportsCompetitionCard>,
  options: RankSectionOptions
): SportsCompetitionCard[] {
  const source = items.slice(
    0,
    SPORTS_PERSONALIZATION_BOUNDS.maxCandidatesPerSection
  );
  const enabled =
    options.personalizationEnabled && profileHasSignals(options.profile);
  const scored: ScoredItem<SportsCompetitionCard>[] = source.map((card) => ({
    item: card,
    score: scoreCompetition(card, options.profile, { neutral: !enabled }),
    tieKey: card.id,
  }));
  const mix = SPORTS_SECTION_DISCOVERY.popular_competitions;
  const ordered =
    typeof mix === "object"
      ? applyDiscoveryBalance(scored, {
          preferencePerTen: Math.floor(mix.preferencePerTen),
          discoveryPerTen: Math.ceil(mix.discoveryPerTen),
        })
      : rankItems(scored);
  return takeBounded(ordered, options.limit ?? ordered.length).map(
    (r) => r.item
  );
}

export function rankSportSection(
  items: ReadonlyArray<SportsWorldCard>,
  options: RankSectionOptions
): SportsWorldCard[] {
  // Preferred first, all retained — no discovery drops.
  const enabled =
    options.personalizationEnabled && profileHasSignals(options.profile);
  const scored = items.map((card) => ({
    item: card,
    score: scoreSport(card, options.profile, { neutral: !enabled }),
    tieKey: card.id,
  }));
  return rankItems(scored).map((r) => r.item);
}

export function rankCountrySection(
  items: ReadonlyArray<SportsCountryCard>,
  options: RankSectionOptions
): SportsCountryCard[] {
  const enabled =
    options.personalizationEnabled && profileHasSignals(options.profile);
  const scored = items.map((card) => ({
    item: card,
    score: scoreCountry(card, options.profile, { neutral: !enabled }),
    tieKey: card.code,
  }));
  return rankItems(scored).map((r) => r.item);
}

export function rankVideoSection(
  items: ReadonlyArray<SportsVideoCard>,
  options: RankSectionOptions
): SportsVideoCard[] {
  const source = items.slice(
    0,
    SPORTS_PERSONALIZATION_BOUNDS.maxCandidatesPerSection
  );
  const enabled =
    options.personalizationEnabled && profileHasSignals(options.profile);
  if (!enabled) return takeBounded([...source], options.limit ?? source.length);

  const scored: ScoredItem<SportsVideoCard>[] = source.map((video) => {
    let score = 0;
    const published = video.publishedAt
      ? Date.parse(video.publishedAt)
      : NaN;
    if (Number.isFinite(published)) {
      const ageHours =
        ((options.now ?? new Date()).getTime() - published) / 3_600_000;
      score += Math.max(0, 40 - Math.min(40, ageHours / 6));
    }
    // Weak fixture-linked preference via continue watching / favorites.
    if (
      video.fixtureId &&
      options.profile?.continueWatchingFixtureIds.has(video.fixtureId)
    ) {
      score += 80;
    }
    if (
      video.fixtureId &&
      options.profile?.explicit.favoriteFixtureIds.has(video.fixtureId)
    ) {
      score += 60;
    }
    if (
      video.fixtureId &&
      options.profile?.reminders.has(video.fixtureId)
    ) {
      score += 50;
    }
    return { item: video, score, tieKey: video.id };
  });

  const mix = SPORTS_SECTION_DISCOVERY[options.sectionId];
  const ordered =
    typeof mix === "object"
      ? applyDiscoveryBalance(scored, {
          preferencePerTen: Math.floor(mix.preferencePerTen),
          discoveryPerTen: Math.ceil(mix.discoveryPerTen),
        })
      : rankItems(scored);
  return takeBounded(ordered, options.limit ?? ordered.length).map(
    (r) => r.item
  );
}

export function personalizeSectionResult(
  sectionId: SportsHomeSectionId,
  type: string,
  items: unknown[],
  options: Omit<RankSectionOptions, "sectionId">
): unknown[] {
  if (!options.personalizationEnabled) {
    return items;
  }

  const base = { ...options, sectionId };

  if (type === "live" || type === "fixtures") {
    return rankMatchSection(asMatchCards(items), base);
  }
  if (type === "competitions") {
    return rankCompetitionSection(
      items as SportsCompetitionCard[],
      base
    );
  }
  if (type === "sports") {
    return rankSportSection(items as SportsWorldCard[], base);
  }
  if (type === "countries") {
    return rankCountrySection(items as SportsCountryCard[], base);
  }
  if (type === "videos") {
    return rankVideoSection(items as SportsVideoCard[], base);
  }
  return items;
}
