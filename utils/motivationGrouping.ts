import type { MotivationItem, MotivationProgram } from "@/types/motivation";
import {
  classifyMotivationEntityName,
  entityIdForName,
  isOrganizationEntityKind,
  isSpeakerEntityKind,
  type MotivationEntity,
} from "@/utils/motivationEntity";
import {
  extractEpisodeNumberFromTitle,
  extractMotivationProgramTitle,
  extractVolumeNumberFromTitle,
  formatMotivationEpisodeTitle,
  isLikelyMisplacedAudiobook,
  naturalCompareMotivation,
  sanitizeMotivationDescription,
  sanitizeMotivationTitle,
  slugifyMotivationKey,
} from "@/utils/motivationPresentation";

export type MotivationVolumeGroup = {
  volumeNumber: number | null;
  label: string;
  items: MotivationItem[];
};

export type MotivationGroupedProgram = {
  id: string;
  program: MotivationProgram;
  items: MotivationItem[];
  volumes: MotivationVolumeGroup[];
  speakerName: string | null;
  creditName: string | null;
  creditKind: "speaker" | "organization" | "unknown";
  episodeCount: number;
  isSynthetic: boolean;
};

const programStash = new Map<string, MotivationGroupedProgram>();
const entityStash = new Map<string, MotivationEntity & { programIds: string[]; items: MotivationItem[] }>();

export function stashMotivationGroupedProgram(group: MotivationGroupedProgram) {
  programStash.set(group.id, group);
}

export function takeMotivationGroupedProgram(id: string) {
  return programStash.get(id) || null;
}

export function stashMotivationEntity(
  entity: MotivationEntity & { programIds: string[]; items: MotivationItem[] }
) {
  entityStash.set(entity.id, entity);
}

export function takeMotivationEntity(id: string) {
  return entityStash.get(id) || null;
}

export function listStashedMotivationEntities(kind: "speaker" | "organization") {
  return [...entityStash.values()].filter((entity) =>
    kind === "speaker" ? isSpeakerEntityKind(entity.kind) : isOrganizationEntityKind(entity.kind)
  );
}

export function enrichMotivationItem(item: MotivationItem): MotivationItem {
  const displayTitle = formatMotivationEpisodeTitle(item.title);
  const episodeFromTitle = extractEpisodeNumberFromTitle(item.title);
  const seasonFromTitle = extractVolumeNumberFromTitle(item.title);
  return {
    ...item,
    title: displayTitle,
    description: sanitizeMotivationDescription(item.description),
    episode_number: item.episode_number ?? episodeFromTitle,
    season_number: item.season_number ?? seasonFromTitle,
  };
}

export function orderMotivationEpisodes(items: MotivationItem[]): MotivationItem[] {
  return [...items].sort((a, b) => {
    const seasonA = a.season_number ?? extractVolumeNumberFromTitle(a.title) ?? 0;
    const seasonB = b.season_number ?? extractVolumeNumberFromTitle(b.title) ?? 0;
    if (seasonA !== seasonB) return seasonA - seasonB;

    const epA = a.episode_number ?? extractEpisodeNumberFromTitle(a.title);
    const epB = b.episode_number ?? extractEpisodeNumberFromTitle(b.title);
    if (epA != null && epB != null && epA !== epB) return epA - epB;
    if (epA != null && epB == null) return -1;
    if (epA == null && epB != null) return 1;

    if ((a.sort_order || 0) !== (b.sort_order || 0)) {
      return (a.sort_order || 0) - (b.sort_order || 0);
    }

    const published = String(a.published_at || "").localeCompare(String(b.published_at || ""));
    if (published) return published;

    return naturalCompareMotivation(a.title, b.title);
  });
}

function buildVolumes(items: MotivationItem[]): MotivationVolumeGroup[] {
  const ordered = orderMotivationEpisodes(items);
  const hasVolume = ordered.some(
    (item) => (item.season_number ?? extractVolumeNumberFromTitle(item.title)) != null
  );
  if (!hasVolume) {
    return [{ volumeNumber: null, label: "Episodes", items: ordered }];
  }

  const map = new Map<number, MotivationItem[]>();
  for (const item of ordered) {
    const volume = item.season_number ?? extractVolumeNumberFromTitle(item.title) ?? 1;
    const list = map.get(volume) || [];
    list.push(item);
    map.set(volume, list);
  }

  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([volumeNumber, volumeItems]) => ({
      volumeNumber,
      label: `Volume ${volumeNumber}`,
      items: orderMotivationEpisodes(volumeItems),
    }));
}

function syntheticProgramId(title: string, speaker: string | null, fallbackId: string) {
  const key = `${slugifyMotivationKey(title)}__${slugifyMotivationKey(speaker || "unknown")}`;
  return key ? `synthetic:${key}` : `synthetic:${fallbackId}`;
}

export function groupMotivationItemsIntoPrograms(
  items: MotivationItem[],
  options?: { excludeMisplacedAudiobooks?: boolean }
): MotivationGroupedProgram[] {
  const exclude = options?.excludeMisplacedAudiobooks !== false;
  const filtered = exclude ? items.filter((item) => !isLikelyMisplacedAudiobook(item)) : items;
  const buckets = new Map<string, MotivationItem[]>();

  for (const raw of filtered) {
    if (!raw?.id) continue;
    const item = enrichMotivationItem(raw);
    const programTitle = item.program_id
      ? extractMotivationProgramTitle(item.title)
      : extractMotivationProgramTitle(item.title);
    const speaker = item.speaker_name || item.channel_name || null;
    const key = item.program_id
      ? `program:${item.program_id}`
      : `title:${slugifyMotivationKey(programTitle)}|speaker:${slugifyMotivationKey(speaker || "")}`;
    const list = buckets.get(key) || [];
    list.push(item);
    buckets.set(key, list);
  }

  const groups: MotivationGroupedProgram[] = [];
  for (const [key, bucketItems] of buckets) {
    const ordered = orderMotivationEpisodes(bucketItems);
    const seed = ordered[0];
    if (!seed) continue;
    const programTitle = extractMotivationProgramTitle(seed.title);
    const rawCredit = seed.speaker_name || seed.channel_name || null;
    const classified = classifyMotivationEntityName(rawCredit);
    const creditKind =
      classified.kind === "speaker"
        ? ("speaker" as const)
        : classified.displayName
          ? ("organization" as const)
          : ("unknown" as const);
    const creditName =
      creditKind === "unknown" ? null : classified.displayName || rawCredit;
    const isSynthetic = !seed.program_id || !key.startsWith("program:");
    const id =
      seed.program_id && key.startsWith("program:")
        ? seed.program_id
        : syntheticProgramId(programTitle, creditName || rawCredit, seed.id);
    const totalDuration = ordered.reduce(
      (sum, item) => sum + Math.max(0, Number(item.duration_seconds || 0)),
      0
    );

    const program: MotivationProgram = {
      id,
      slug: slugifyMotivationKey(programTitle) || id,
      title: programTitle,
      subtitle: creditName,
      description: seed.description || null,
      category_slug: seed.category_slug || null,
      artwork_url: seed.artwork || null,
      language_code: seed.language || null,
      country_code: seed.country || null,
      program_type: ordered.length > 1 ? "series" : "standalone",
      session_count: ordered.length,
      total_duration_seconds: totalDuration,
      published_at: seed.published_at || null,
      is_featured: ordered.some((item) => item.is_featured),
    };

    const group: MotivationGroupedProgram = {
      id,
      program,
      items: ordered,
      volumes: buildVolumes(ordered),
      speakerName: creditKind === "speaker" ? creditName : null,
      creditName,
      creditKind,
      episodeCount: ordered.length,
      isSynthetic,
    };
    groups.push(group);
    stashMotivationGroupedProgram(group);
  }

  return groups.sort((a, b) => {
    if (b.episodeCount !== a.episodeCount) return b.episodeCount - a.episodeCount;
    return naturalCompareMotivation(a.program.title, b.program.title);
  });
}

export function collectEntitiesFromGroups(
  groups: MotivationGroupedProgram[],
  options?: { speakersLimit?: number; organizationsLimit?: number; minEpisodesForSpeaker?: number }
) {
  const speakersLimit = options?.speakersLimit ?? 8;
  const organizationsLimit = options?.organizationsLimit ?? 6;
  const minEpisodesForSpeaker = options?.minEpisodesForSpeaker ?? 2;

  const map = new Map<
    string,
    MotivationEntity & { programIds: Set<string>; items: MotivationItem[] }
  >();

  for (const group of groups) {
    const raw = group.creditName || group.speakerName;
    if (!raw) continue;
    const classified = classifyMotivationEntityName(raw);
    if (classified.kind === "unknown" || !classified.displayName) continue;
    const id = entityIdForName(classified.displayName, classified.kind);
    const existing = map.get(id);
    if (existing) {
      existing.episodeCount += group.episodeCount;
      existing.programCount += 1;
      existing.programIds.add(group.id);
      existing.items.push(...group.items);
      if (!existing.artwork && group.program.artwork_url) {
        existing.artwork = group.program.artwork_url;
      }
    } else {
      map.set(id, {
        id,
        name: raw,
        displayName: classified.displayName,
        kind: classified.kind,
        episodeCount: group.episodeCount,
        programCount: 1,
        artwork: group.program.artwork_url,
        programIds: new Set([group.id]),
        items: [...group.items],
      });
    }
  }

  const all = [...map.values()].map((entry) => {
    const entity = {
      id: entry.id,
      name: entry.name,
      displayName: entry.displayName,
      kind: entry.kind,
      episodeCount: entry.episodeCount,
      programCount: entry.programCount,
      artwork: entry.artwork,
      programIds: [...entry.programIds],
      items: entry.items,
    };
    stashMotivationEntity(entity);
    return entity;
  });

  const speakers = all
    .filter((entity) => isSpeakerEntityKind(entity.kind))
    .filter((entity) => entity.episodeCount >= minEpisodesForSpeaker || entity.programCount >= 2)
    .sort(
      (a, b) =>
        b.programCount - a.programCount ||
        b.episodeCount - a.episodeCount ||
        naturalCompareMotivation(a.displayName, b.displayName)
    );

  const organizations = all
    .filter((entity) => isOrganizationEntityKind(entity.kind))
    .sort(
      (a, b) =>
        b.episodeCount - a.episodeCount ||
        naturalCompareMotivation(a.displayName, b.displayName)
    );

  return {
    speakers: speakers.slice(0, speakersLimit),
    organizations: organizations.slice(0, organizationsLimit),
    allSpeakers: speakers,
    allOrganizations: organizations,
    stats: {
      humanSpeakers: speakers.length,
      organizations: organizations.length,
      oneItemSpeakers: all.filter(
        (entity) => isSpeakerEntityKind(entity.kind) && entity.episodeCount === 1
      ).length,
    },
  };
}

export function rankMotivationSearchResults(items: MotivationItem[], query: string) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return items;

  const scoreItem = (item: MotivationItem) => {
    const title = sanitizeMotivationTitle(item.title).toLowerCase();
    const program = extractMotivationProgramTitle(item.title).toLowerCase();
    const speaker = String(item.speaker_name || item.channel_name || "").toLowerCase();
    const category = String(item.category || item.category_slug || "").toLowerCase();
    const description = sanitizeMotivationDescription(item.description).toLowerCase();

    if (program === q) return 100;
    if (speaker === q) return 95;
    if (title === q) return 90;
    if (program.startsWith(q)) return 80;
    if (speaker.startsWith(q)) return 75;
    if (title.startsWith(q)) return 70;
    if (title.includes(q)) return 55;
    if (program.includes(q)) return 50;
    if (speaker.includes(q)) return 45;
    if (category.includes(q)) return 35;
    if (description.includes(q)) return 20;
    return 0;
  };

  return [...items]
    .map((item) => ({ item, score: scoreItem(item) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || naturalCompareMotivation(a.item.title, b.item.title))
    .map((row) => row.item);
}

/** @deprecated Use collectEntitiesFromGroups */
export function collectSpeakersFromGroups(groups: MotivationGroupedProgram[], limit = 24) {
  return collectEntitiesFromGroups(groups, { speakersLimit: limit }).speakers.map((speaker) => ({
    name: speaker.displayName,
    count: speaker.episodeCount,
    artwork: speaker.artwork,
  }));
}
