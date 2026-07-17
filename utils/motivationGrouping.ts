import type { MotivationItem, MotivationProgram } from "@/types/motivation";
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
  episodeCount: number;
  isSynthetic: boolean;
};

const programStash = new Map<string, MotivationGroupedProgram>();

export function stashMotivationGroupedProgram(group: MotivationGroupedProgram) {
  programStash.set(group.id, group);
}

export function takeMotivationGroupedProgram(id: string) {
  return programStash.get(id) || null;
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
    const speaker = seed.speaker_name || seed.channel_name || null;
    const isSynthetic = !seed.program_id || !key.startsWith("program:");
    const id = seed.program_id && key.startsWith("program:")
      ? seed.program_id
      : syntheticProgramId(programTitle, speaker, seed.id);

    const totalDuration = ordered.reduce(
      (sum, item) => sum + Math.max(0, Number(item.duration_seconds || 0)),
      0
    );

    const program: MotivationProgram = {
      id,
      slug: slugifyMotivationKey(programTitle) || id,
      title: programTitle,
      subtitle: speaker,
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
      speakerName: speaker,
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

export function collectSpeakersFromGroups(groups: MotivationGroupedProgram[], limit = 24) {
  const counts = new Map<string, { name: string; count: number; artwork?: string | null }>();
  for (const group of groups) {
    const name = group.speakerName?.trim();
    if (!name) continue;
    const existing = counts.get(name.toLowerCase());
    if (existing) {
      existing.count += group.episodeCount;
    } else {
      counts.set(name.toLowerCase(), {
        name,
        count: group.episodeCount,
        artwork: group.program.artwork_url,
      });
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || naturalCompareMotivation(a.name, b.name))
    .slice(0, limit);
}
