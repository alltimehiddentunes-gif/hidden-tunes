import type { MotivationGrowthCandidate } from "@/lib/motivationHealth";
import {
  normalizeMotivationMetadata,
  sanitizeMotivationDurationSeconds,
} from "@/lib/motivationMetadataNormalize";
import type {
  MotivationDiscoveryCandidate,
  MotivationDiscoveryOptions,
  MotivationDiscoveryPage,
  MotivationSourceAdapter,
} from "@/lib/motivationSources/types";

const ARCHIVE_SEARCH_URL = "https://archive.org/advancedsearch.php";
const ARCHIVE_METADATA_URL = "https://archive.org/metadata";

/** Item-level rights still verified; this only avoids discovering unlicensed Archive noise. */
const ARCHIVE_RIGHTS_FILTER =
  "(licenseurl:*publicdomain* OR licenseurl:*creativecommons*)";

function withArchiveRightsFilter(query: string): string {
  if (query.includes("licenseurl:")) return query;
  return `(${query}) AND ${ARCHIVE_RIGHTS_FILTER}`;
}

export const ARCHIVE_MOTIVATION_QUERY_FAMILIES: Record<string, string[]> = {
  speeches: [
    '(subject:"motivational speaking" OR subject:"inspirational speech" OR subject:"commencement address" OR subject:"keynote speech") AND mediatype:movies -course -lecture -tutorial -playlist -trailer',
    '(subject:speeches OR subject:"public speaking") AND mediatype:movies -course -lecture -documentary -news',
  ],
  "motivational-speeches": [
    '(subject:"motivational speaking" OR subject:"inspirational speech" OR subject:"keynote speech") AND mediatype:movies -course -lecture -tutorial -playlist',
  ],
  "commencement-speeches": [
    '(subject:"commencement address" OR subject:"commencement speech" OR subject:"graduation speech") AND mediatype:movies -course -lecture -tutorial -playlist -documentary',
  ],
  commencement: [
    '(subject:"commencement address" OR subject:"commencement speech" OR subject:"graduation speech") AND mediatype:movies -course -lecture -tutorial -playlist -documentary',
  ],
  leadership: [
    '(subject:leadership OR subject:"business motivation" OR subject:entrepreneurship OR subject:"career development") AND mediatype:movies -course -lecture -tutorial -playlist',
  ],
  mindset: [
    '(subject:motivation OR subject:"personal development" OR subject:"self help" OR subject:mindset OR subject:discipline) AND mediatype:movies -course -lecture -tutorial -playlist',
  ],
  discipline: [
    '(subject:discipline OR subject:"self control" OR subject:consistency OR subject:habits) AND (subject:motivation OR subject:"personal development") AND mediatype:movies -course -lecture -tutorial -playlist',
  ],
  success: [
    '(subject:success OR subject:"winning mindset" OR subject:achievement) AND (subject:motivation OR subject:"personal development") AND mediatype:movies -course -lecture -tutorial -playlist',
  ],
  "personal-development": [
    '(subject:"personal development" OR subject:"personal growth" OR subject:"self development") AND mediatype:movies -course -lecture -tutorial -playlist',
  ],
  "self-improvement": [
    '(subject:"self improvement" OR subject:"self help" OR subject:"self-improvement") AND mediatype:movies -course -lecture -tutorial -playlist',
  ],
  confidence: [
    '(subject:confidence OR subject:"self belief" OR subject:"self-esteem") AND (subject:motivation OR subject:"personal development") AND mediatype:movies -course -lecture -tutorial -playlist',
  ],
  productivity: [
    '(subject:productivity OR subject:"time management" OR subject:"deep work") AND (subject:motivation OR subject:"personal development") AND mediatype:movies -course -lecture -tutorial -playlist',
  ],
  fitness: [
    '(subject:"fitness motivation" OR subject:"sports motivation" OR subject:"gym motivation") AND mediatype:movies -course -lecture -tutorial -playlist',
  ],
  "fitness-motivation": [
    '(subject:"fitness motivation" OR subject:"sports motivation" OR subject:"gym motivation") AND mediatype:movies -course -lecture -tutorial -playlist',
  ],
  faith: [
    '(subject:"faith and purpose" OR subject:"spiritual motivation" OR subject:"healing and recovery") AND mediatype:movies -course -lecture -tutorial -playlist -documentary',
  ],
  "faith-motivation": [
    '(subject:"faith and purpose" OR subject:"spiritual motivation" OR subject:"healing and recovery") AND mediatype:movies -course -lecture -tutorial -playlist -documentary',
  ],
  "inspirational-talks": [
    '(subject:"inspirational talk" OR subject:"inspirational speech" OR subject:"inspirational message") AND mediatype:movies -course -lecture -tutorial -playlist',
  ],
  "life-advice": [
    '(subject:"life advice" OR subject:"life lessons" OR subject:"life wisdom") AND (subject:motivation OR subject:inspiration) AND mediatype:movies -course -lecture -tutorial -playlist',
  ],
  "career-motivation": [
    '(subject:"career motivation" OR subject:"career development" OR subject:"professional growth") AND mediatype:movies -course -lecture -tutorial -playlist',
  ],
  "business-motivation": [
    '(subject:"business motivation" OR subject:entrepreneurship OR subject:"business success") AND mediatype:movies -course -lecture -tutorial -playlist',
  ],
  "study-motivation": [
    '(subject:"study motivation" OR subject:"academic motivation" OR subject:"learning motivation") AND mediatype:movies -course -lecture -tutorial -playlist',
  ],
  "historical-speeches": [
    '(subject:"historical speech" OR subject:"famous speech" OR subject:"great speeches") AND mediatype:movies -course -lecture -tutorial -playlist -documentary',
  ],
  "public-domain-speeches": [
    '(subject:speeches OR subject:"public speaking") AND (licenseurl:*publicdomain* OR licenseurl:*creativecommons*) AND mediatype:movies -course -lecture -tutorial -playlist',
  ],
  /** High-yield licensed audio/video Ã¢â‚¬â€ kept as simpler queries so Archive search stays under timeout. */
  "licensed-audio-selfdev": [
    `mediatype:audio AND ${ARCHIVE_RIGHTS_FILTER} AND (subject:motivation OR subject:motivational OR subject:inspirational OR subject:"self help" OR subject:"personal development" OR subject:mindset OR subject:leadership OR subject:affirmations)`,
  ],
  "licensed-audio-growth": [
    `mediatype:audio AND ${ARCHIVE_RIGHTS_FILTER} AND (subject:"personal growth" OR subject:discipline OR subject:confidence OR subject:productivity OR subject:resilience OR subject:encouragement OR subject:empowerment OR subject:"life coaching" OR subject:"positive thinking")`,
  ],
  "licensed-movies-selfdev": [
    `mediatype:movies AND ${ARCHIVE_RIGHTS_FILTER} AND (subject:motivation OR subject:inspirational OR subject:"self help" OR subject:leadership OR subject:speech OR subject:mindset) -course -lecture -tutorial -playlist`,
  ],
  "title-audio-motivation": [
    `mediatype:audio AND ${ARCHIVE_RIGHTS_FILTER} AND (title:motivation OR title:motivational OR title:inspirational OR title:"self help" OR title:mindset OR title:affirmations OR title:leadership OR title:confidence)`,
  ],
  "licensed-audio-speeches": [
    `mediatype:audio AND ${ARCHIVE_RIGHTS_FILTER} AND (subject:speech OR subject:speeches OR subject:"public speaking" OR subject:keynote OR title:speech OR title:keynote OR title:commencement)`,
  ],
  "opensource-audio-licensed": [
    `collection:opensource_audio AND ${ARCHIVE_RIGHTS_FILTER} AND (subject:motivation OR subject:inspirational OR subject:speech OR subject:leadership OR subject:"self help" OR title:motivation OR title:speech)`,
  ],
  "community-audio-licensed": [
    `collection:community_audio AND ${ARCHIVE_RIGHTS_FILTER} AND (subject:motivation OR subject:inspirational OR subject:speech OR subject:mindset OR title:motivation OR title:inspirational OR title:affirmations)`,
  ],
  "librivox-selfhelp": [
    'collection:librivoxaudio AND (subject:"Self-Help" OR subject:"self help" OR subject:"Conduct of life" OR subject:Ethics OR subject:Psychology)',
  ],
  "librivox-philosophy": [
    'collection:librivoxaudio AND (subject:Philosophy OR subject:Religion OR subject:Education OR subject:Business OR subject:Biography OR subject:Success OR subject:Inspiration)',
  ],
  /** Additional Librivox chapter corpus for expansion (wisdom / social thought). */
  "librivox-essays-history": [
    'collection:librivoxaudio AND (subject:Essays OR subject:History OR subject:Mythology OR subject:Folklore OR subject:"Ancient history" OR subject:Civilization)',
  ],
  "librivox-social-thought": [
    'collection:librivoxaudio AND (subject:Sociology OR subject:Economics OR subject:"Political science" OR subject:Government OR subject:Law OR subject:Anthropology)',
  ],
  "librivox-science-nature": [
    'collection:librivoxaudio AND (subject:Science OR subject:Nature OR subject:Astronomy OR subject:Medicine OR subject:Evolution OR subject:"Natural history")',
  ],
  prelinger: [
    'collection:prelinger AND (subject:inspiration OR subject:guidance OR subject:"personal growth") AND mediatype:movies -course -lecture -tutorial -playlist',
  ],
  "opensource-video": [
    'collection:opensource_movies AND (subject:motivation OR subject:inspiration OR subject:success OR subject:leadership) -course -lecture -tutorial -playlist -documentary',
  ],
  opensource: [
    'collection:opensource_movies AND (subject:motivation OR subject:inspiration OR subject:success OR subject:leadership) -course -lecture -tutorial -playlist -documentary',
  ],
  "opensource-audio": [
    'collection:opensource_audio AND (subject:motivation OR subject:inspiration OR subject:speech OR subject:leadership) -course -lecture -tutorial -playlist',
  ],
  "community-audio": [
    'collection:community_audio AND (subject:motivation OR subject:inspiration OR subject:speech OR subject:"personal development") -course -lecture -tutorial -playlist',
  ],
  "community-video": [
    'collection:community_media AND (subject:motivation OR subject:inspiration OR subject:speech OR subject:leadership) -course -lecture -tutorial -playlist',
  ],
};

const SUBCATEGORY_RULES: Array<{ pattern: RegExp; subcategory: string }> = [
  { pattern: /\bgym|fitness|workout|exercise\b/i, subcategory: "Gym motivation" },
  { pattern: /\bstudy|learning|school\b/i, subcategory: "Study motivation" },
  { pattern: /\bbusiness|entrepreneur|leadership|success\b/i, subcategory: "Business motivation" },
  { pattern: /\bfaith|gospel|spiritual|worship|prayer\b/i, subcategory: "Faith motivation" },
  { pattern: /\bspeech|commencement|keynote|address\b/i, subcategory: "Motivational speeches" },
  { pattern: /\bmindset|discipline|focus|habit\b/i, subcategory: "Mindset" },
  { pattern: /\bself[- ]?improv|growth|better\b/i, subcategory: "Self-improvement" },
];

type ArchiveSearchDoc = {
  identifier?: string;
  title?: string;
  description?: string;
  subject?: string | string[];
  creator?: string | string[];
  language?: string | string[];
  collection?: string | string[];
  licenseurl?: string;
};

type ArchiveFile = {
  name?: string;
  format?: string;
  size?: string;
  length?: string;
  source?: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function collectSubjects(doc: ArchiveSearchDoc) {
  const values = new Set<string>();
  const subject = doc.subject;
  if (Array.isArray(subject)) {
    for (const entry of subject) values.add(normalizeText(entry));
  } else {
    const cleaned = normalizeText(subject);
    if (cleaned) values.add(cleaned);
  }
  return [...values].filter(Boolean);
}

function collectCollection(doc: ArchiveSearchDoc) {
  const collection = doc.collection;
  if (Array.isArray(collection)) return normalizeText(collection[0]);
  return normalizeText(collection);
}

function inferSubcategory(title: string, subjects: string[]) {
  const haystack = `${title} ${subjects.join(" ")}`;
  for (const rule of SUBCATEGORY_RULES) {
    if (rule.pattern.test(haystack)) return rule.subcategory;
  }
  return "Motivation";
}

function listPlayableArchiveFiles(files: ArchiveFile[], expandChapters: boolean) {
  const candidates = files
    .filter((file) => {
      const name = normalizeText(file.name).toLowerCase();
      const format = normalizeText(file.format).toLowerCase();
      if (!name || name.endsWith(".xml") || name.endsWith(".torrent")) return false;
      if (name.includes("_64kb.")) return false;
      return (
        name.endsWith(".mp4") ||
        name.endsWith(".webm") ||
        name.endsWith(".m4v") ||
        name.endsWith(".mp3") ||
        name.endsWith(".m4a") ||
        format.includes("h.264") ||
        format.includes("mpeg4") ||
        format.includes("matroska") ||
        format.includes("vorbis") ||
        format.includes("mp3")
      );
    })
    .map((file) => ({
      name: normalizeText(file.name),
      size: Number(file.size || 0),
      length: sanitizeMotivationDurationSeconds(file.length),
      isVideo:
        Boolean(normalizeText(file.name).toLowerCase().match(/\.(mp4|webm|m4v)$/)) ||
        normalizeText(file.format).toLowerCase().includes("h.264"),
    }))
    .filter((file) => file.name);

  if (!expandChapters) {
    candidates.sort((a, b) => {
      const aMp4 = a.name.toLowerCase().endsWith(".mp4") ? 1 : 0;
      const bMp4 = b.name.toLowerCase().endsWith(".mp4") ? 1 : 0;
      if (aMp4 !== bMp4) return bMp4 - aMp4;
      return a.size - b.size;
    });
    return candidates[0] ? [candidates[0]] : [];
  }

  // Prefer 128kb chapter files; skip tiny duplicates by stem.
  const byStem = new Map<string, (typeof candidates)[number]>();
  for (const file of candidates) {
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".mp3") && !lower.endsWith(".m4a")) continue;
    const stem = lower
      .replace(/_64kb\.mp3$/i, "")
      .replace(/_128kb\.mp3$/i, "")
      .replace(/\.mp3$/i, "")
      .replace(/\.m4a$/i, "");
    const existing = byStem.get(stem);
    const prefer =
      !existing ||
      (lower.includes("128kb") && !existing.name.toLowerCase().includes("128kb")) ||
      file.size > existing.size;
    if (prefer) byStem.set(stem, file);
  }

  const chapters = [...byStem.values()];
  chapters.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return chapters.length > 0 ? chapters : candidates.slice(0, 1);
}

function chapterTitle(bookTitle: string, fileName: string) {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  if (!base || base.toLowerCase() === bookTitle.toLowerCase()) return bookTitle;
  return `${bookTitle} Ã¢â‚¬â€ ${base}`;
}

export function extractArchiveDurationSeconds(
  files: ArchiveFile[],
  metadata?: { runtime?: string | number; length?: string | number }
) {
  const picked = listPlayableArchiveFiles(files, false)[0];
  if (picked?.length) return picked.length;

  const runtime = sanitizeMotivationDurationSeconds(metadata?.runtime);
  if (runtime) return runtime;

  const metaLength = sanitizeMotivationDurationSeconds(metadata?.length);
  if (metaLength) return metaLength;

  return null;
}

async function fetchArchiveSearchPage(query: string, page: number, rows: number) {
  const params = new URLSearchParams({
    q: withArchiveRightsFilter(query),
    fl: "identifier,title,description,subject,creator,language,collection,licenseurl",
    sort: "downloads desc",
    rows: String(rows),
    page: String(page),
    output: "json",
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`${ARCHIVE_SEARCH_URL}?${params.toString()}`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(90_000),
      });
      if (!response.ok) throw new Error(`Archive search failed (${response.status}).`);
      const payload = (await response.json()) as { response?: { docs?: ArchiveSearchDoc[] } };
      return payload.response?.docs || [];
    } catch (error) {
      if (attempt >= 2) throw error;
      await sleep(1500 * 2 ** attempt);
    }
  }

  return [];
}

async function fetchArchiveDiscoveryCandidates(doc: ArchiveSearchDoc) {
  const identifier = normalizeText(doc.identifier);
  if (!identifier) return [] as MotivationDiscoveryCandidate[];

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`${ARCHIVE_METADATA_URL}/${encodeURIComponent(identifier)}`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(45_000),
      });
      if (!response.ok) return [];

      const payload = (await response.json()) as {
        files?: ArchiveFile[];
        metadata?: {
          title?: string;
          description?: string;
          creator?: string | string[];
          language?: string | string[];
          runtime?: string | number;
          length?: string | number;
          licenseurl?: string;
          rights?: string;
          "possible-copyright-status"?: string;
        };
      };

      const collection = collectCollection(doc) || "";
      const expandChapters = /librivox/i.test(collection) || /librivox/i.test(identifier);
      const mediaFiles = listPlayableArchiveFiles(payload.files || [], expandChapters);
      if (mediaFiles.length === 0) return [];

      const normalized = normalizeMotivationMetadata({
        title: payload.metadata?.title || doc.title,
        description: payload.metadata?.description || doc.description,
        creator: Array.isArray(payload.metadata?.creator)
          ? payload.metadata?.creator[0]
          : payload.metadata?.creator,
        language: Array.isArray(payload.metadata?.language)
          ? payload.metadata?.language[0]
          : payload.metadata?.language,
        subjects: collectSubjects(doc),
        fileNames: mediaFiles.map((file) => file.name),
      });

      if (!normalized.title || normalized.weakTitle) return [];

      const subjects = normalized.subjects.length ? normalized.subjects : collectSubjects(doc);
      const subcategory = inferSubcategory(normalized.title, subjects);
      const licenseUrl =
        normalizeText(payload.metadata?.licenseurl) || normalizeText(doc.licenseurl) || undefined;

      return mediaFiles.map((picked) => {
        const parentId = identifier;
        const sourceId =
          expandChapters && mediaFiles.length > 1 ? `${identifier}::${picked.name}` : identifier;
        const sourceUrl = `https://archive.org/download/${encodeURIComponent(parentId)}/${encodeURIComponent(picked.name)}`;
        const mediaType = picked.isVideo ? "video" : "audio";
        const title =
          expandChapters && mediaFiles.length > 1
            ? chapterTitle(normalized.title, picked.name)
            : normalized.title;

        return {
          sourceKey: `archive:${sourceId}`,
          sourceType: "archive_video",
          sourceId,
          canonicalSourceUrl: sourceUrl,
          title,
          description: normalized.description || undefined,
          creator: normalized.creator || undefined,
          channel: normalized.creator || (expandChapters ? "LibriVox" : "Internet Archive"),
          tags: [subcategory, ...subjects.slice(0, 5)].filter(Boolean),
          subjects,
          language: normalized.language || "en",
          country: "US",
          durationSeconds:
            picked.length || extractArchiveDurationSeconds(payload.files || [], payload.metadata),
          artworkUrl: `https://archive.org/services/img/${encodeURIComponent(parentId)}`,
          collection: collection || undefined,
          provider: "internet_archive",
          category: "Motivation",
          subcategory,
          mediaCandidates: [
            {
              url: sourceUrl,
              mediaType,
              fileName: picked.name,
              durationSeconds: picked.length || null,
              isPrimary: true,
            },
          ],
          license: licenseUrl,
          rightsEvidence: {
            licenseurl: licenseUrl,
            rights: payload.metadata?.rights || null,
            "possible-copyright-status":
              payload.metadata?.["possible-copyright-status"] || null,
          },
          rawMetadata: {
            doc,
            metadata: payload.metadata,
            parent_identifier: parentId,
          },
        } satisfies MotivationDiscoveryCandidate;
      });
    } catch {
      if (attempt >= 2) return [];
      await sleep(400);
    }
  }

  return [];
}

export function discoveryCandidateToGrowthCandidate(
  candidate: MotivationDiscoveryCandidate
): MotivationGrowthCandidate {
  const primary = candidate.mediaCandidates.find((entry) => entry.isPrimary) || candidate.mediaCandidates[0];
  const rightsEvidence =
    candidate.rightsEvidence && typeof candidate.rightsEvidence === "object"
      ? (candidate.rightsEvidence as {
          licenseurl?: string | null;
          rights?: string | null;
          "possible-copyright-status"?: string | null;
        })
      : null;
  return {
    source_type: candidate.sourceType,
    source_id: candidate.sourceId,
    source_url: primary?.url || candidate.canonicalSourceUrl,
    embed_url: `https://archive.org/embed/${encodeURIComponent(String(candidate.sourceId).split("::")[0])}`,
    title: candidate.title,
    description: candidate.description || null,
    thumbnail_url: candidate.artworkUrl || null,
    channel_name: candidate.channel || null,
    creator_name: candidate.creator || null,
    speaker_name: candidate.speaker || null,
    category: candidate.category || "Motivation",
    subcategory: candidate.subcategory || null,
    tags: candidate.tags,
    language: candidate.language || null,
    region: candidate.country || null,
    duration_seconds: candidate.durationSeconds ?? primary?.durationSeconds ?? null,
    source_key: candidate.sourceKey,
    subjects: candidate.subjects,
    collection: candidate.collection,
    provider: candidate.provider,
    file_names: primary?.fileName ? [primary.fileName] : [],
    license_url: candidate.license || rightsEvidence?.licenseurl || null,
    rights_label: rightsEvidence?.rights || null,
  };
}

export class ArchiveMotivationSource implements MotivationSourceAdapter {
  sourceKey = "archive:internet-archive";
  provider = "internet_archive";

  async discoverPage(options: MotivationDiscoveryOptions): Promise<MotivationDiscoveryPage> {
    const queryFamily = options.queryFamily || "speeches";
    const queries = ARCHIVE_MOTIVATION_QUERY_FAMILIES[queryFamily] || ARCHIVE_MOTIVATION_QUERY_FAMILIES.speeches;
    const page = Math.max(1, Number(options.page ?? 1));
    const rowsPerPage = Math.max(10, Math.min(100, Number(options.rowsPerPage ?? 50)));
    const target = Math.max(1, Number(options.target ?? rowsPerPage));
    const concurrency = Math.max(1, Math.min(12, Number(options.concurrency ?? 6)));
    const query = queries[(page - 1) % queries.length];
    const chapterFamily = String(queryFamily).startsWith("librivox");
    // Finish every search hit on the page for chapter-expanded families so we
    // do not permanently skip books when a batch fills mid-page.
    const softCap = chapterFamily ? Math.max(target, rowsPerPage * 60) : target;

    const docs = await fetchArchiveSearchPage(query, page, rowsPerPage);
    const candidates: MotivationDiscoveryCandidate[] = [];
    const seen = new Set<string>();

    for (let index = 0; index < docs.length && candidates.length < softCap; index += concurrency) {
      const slice = docs.slice(index, index + concurrency);
      const resolved = await Promise.all(slice.map((doc) => fetchArchiveDiscoveryCandidates(doc)));
      for (const group of resolved) {
        for (const entry of group) {
          if (!entry || seen.has(entry.sourceKey)) continue;
          seen.add(entry.sourceKey);
          candidates.push(entry);
          if (candidates.length >= softCap) break;
        }
        if (candidates.length >= softCap) break;
      }
      await sleep(40);
    }

    return {
      candidates,
      nextPage: docs.length > 0 ? page + 1 : null,
      nextCursor: docs.length > 0 ? String(page + 1) : null,
      queryFamily,
      provider: this.provider,
    };
  }
}

export type ArchiveMotivationCandidateBuildResult = {
  candidates: MotivationGrowthCandidate[];
  startPage: number;
  endPage: number;
  pagesExamined: number;
};

export async function buildArchiveMotivationCandidates(options?: {
  target?: number;
  rowsPerPage?: number;
  maxPagesPerQuery?: number;
  startPage?: number;
  concurrency?: number;
  queryFamily?: string;
}): Promise<ArchiveMotivationCandidateBuildResult> {
  const adapter = new ArchiveMotivationSource();
  const target = options?.target ?? 6000;
  const rowsPerPage = options?.rowsPerPage ?? 100;
  const maxPagesPerQuery = options?.maxPagesPerQuery ?? 60;
  const startPage = Math.max(1, Number(options?.startPage ?? 1));
  const concurrency = options?.concurrency ?? 4;
  const queryFamilies = options?.queryFamily
    ? [options.queryFamily]
    : Object.keys(ARCHIVE_MOTIVATION_QUERY_FAMILIES);

  const candidates: MotivationGrowthCandidate[] = [];
  const seen = new Set<string>();
  let endPage = Math.max(0, startPage - 1);
  let pagesExamined = 0;

  for (const queryFamily of queryFamilies) {
    const lastPage = startPage + maxPagesPerQuery - 1;
    const chapterFamily = String(queryFamily).startsWith("librivox");
    for (let page = startPage; page <= lastPage && candidates.length < target; page += 1) {
      pagesExamined += 1;
      endPage = page;
      const pageTarget = chapterFamily
        ? Math.min(3000, Math.max(target - candidates.length, 800))
        : Math.min(rowsPerPage, target - candidates.length);
      const pageResult = await adapter.discoverPage({
        target: pageTarget,
        queryFamily,
        page,
        rowsPerPage: chapterFamily ? Math.min(40, rowsPerPage) : rowsPerPage,
        concurrency,
      });

      for (const discovery of pageResult.candidates) {
        if (seen.has(discovery.sourceKey)) continue;
        seen.add(discovery.sourceKey);
        candidates.push(discoveryCandidateToGrowthCandidate(discovery));
        if (candidates.length >= target) break;
      }

      if (!pageResult.nextPage || pageResult.candidates.length === 0) break;
      await sleep(200);
    }
  }

  return {
    candidates,
    startPage,
    endPage,
    pagesExamined,
  };
}
