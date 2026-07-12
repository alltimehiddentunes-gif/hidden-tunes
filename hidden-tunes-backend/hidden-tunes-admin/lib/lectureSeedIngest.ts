import { LECTURE_CATEGORIES } from "@/lib/lectureCatalog";
import { cleanText } from "@/lib/tvCatalog";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type LectureMedia = {
  title: string;
  lesson_number: number;
  audio_url?: string;
  video_url?: string;
  media_type: "audio" | "video";
  mime_type?: string;
  duration_seconds?: number;
  source_key: string;
};

type LectureSeed = {
  title: string;
  subtitle?: string;
  description: string;
  category_slug: string;
  instructor_name?: string;
  speaker_name?: string;
  creator_name?: string;
  topic_tags: string[];
  difficulty?: string;
  artwork_url?: string;
  source_type: string;
  source_url: string;
  source_key: string;
  rights: string;
  media: LectureMedia[];
};

type ArchiveLectureSeedDef = Omit<LectureSeed, "media" | "artwork_url" | "source_url"> & {
  archive_id: string;
  lesson_limit: number;
  media_kind: "audio" | "video";
};

export type LectureSeedIngestResult = {
  success: boolean;
  dry_run: boolean;
  categories_checked: number;
  items_inserted: number;
  items_updated: number;
  files_inserted: number;
  files_updated: number;
  skipped: number;
  errors: Array<{ source_key: string; title: string; message: string }>;
};

const ARCHIVE_SEED_DEFS: ArchiveLectureSeedDef[] = [
  {
    archive_id: "captainsofindustry_1110_librivox",
    title: "Captains of Industry",
    subtitle: "Public-domain business leadership readings",
    description:
      "Public-domain business and industry lessons from James Parton's Captains of Industry, indexed as metadata-first educational listening.",
    category_slug: "business",
    instructor_name: "James Parton",
    creator_name: "LibriVox",
    topic_tags: ["business", "industry", "leadership"],
    difficulty: "introductory",
    source_type: "archive_librivox",
    source_key: "archive_librivox:captainsofindustry:business-lessons",
    rights: "public_domain",
    lesson_limit: 47,
    media_kind: "audio",
  },
  {
    archive_id: "pride_and_prejudice_librivox",
    title: "Pride and Prejudice",
    subtitle: "Public-domain literature for language study",
    description:
      "Jane Austen's Pride and Prejudice, indexed for language-learning and literary study with chapter-level lesson metadata.",
    category_slug: "language-learning",
    instructor_name: "Jane Austen",
    creator_name: "LibriVox",
    topic_tags: ["language-learning", "literature", "english"],
    difficulty: "intermediate",
    source_type: "archive_librivox",
    source_key: "archive_librivox:pride-and-prejudice:language-learning",
    rights: "public_domain",
    lesson_limit: 5,
    media_kind: "audio",
  },
  {
    archive_id: "federalist_papers_librivox",
    title: "The Federalist Papers",
    subtitle: "Public-domain civic and political lectures",
    description:
      "The Federalist Papers as open academic listening, indexed with deterministic lesson ordering for civic education.",
    category_slug: "academic-lectures",
    instructor_name: "Alexander Hamilton",
    speaker_name: "James Madison",
    creator_name: "LibriVox",
    topic_tags: ["academic-lectures", "civics", "history"],
    difficulty: "advanced",
    source_type: "archive_librivox",
    source_key: "archive_librivox:federalist-papers:academic",
    rights: "public_domain",
    lesson_limit: 5,
    media_kind: "audio",
  },
  {
    archive_id: "us_history_vol1_librivox",
    title: "History of the United States, Volume 1",
    subtitle: "Public-domain American history lectures",
    description:
      "Charles and Mary Beard's History of the United States, Volume 1, indexed for academic lecture listening.",
    category_slug: "academic-lectures",
    instructor_name: "Charles Beard",
    speaker_name: "Mary Beard",
    creator_name: "LibriVox",
    topic_tags: ["academic-lectures", "history", "united-states"],
    difficulty: "intermediate",
    source_type: "archive_librivox",
    source_key: "archive_librivox:us-history-vol1:academic",
    rights: "public_domain",
    lesson_limit: 5,
    media_kind: "audio",
  },
  {
    archive_id: "art_of_war_librivox",
    title: "The Art of War",
    subtitle: "Public-domain strategy and study lessons",
    description:
      "Sun Tzu's Art of War, indexed as study-skills and strategic thinking lessons with chapter-level metadata.",
    category_slug: "study-skills",
    instructor_name: "Sun Tzu",
    creator_name: "LibriVox",
    topic_tags: ["study-skills", "strategy", "philosophy"],
    difficulty: "introductory",
    source_type: "archive_librivox",
    source_key: "archive_librivox:art-of-war:study-skills",
    rights: "public_domain",
    lesson_limit: 5,
    media_kind: "audio",
  },
  {
    archive_id: "count_monte_cristo_0711_librivox",
    title: "The Count of Monte Cristo",
    subtitle: "Public-domain literary academic lectures",
    description:
      "Alexandre Dumas's The Count of Monte Cristo, indexed for academic lecture listening with long-course pagination support.",
    category_slug: "academic-lectures",
    instructor_name: "Alexandre Dumas",
    creator_name: "LibriVox",
    topic_tags: ["academic-lectures", "literature", "classic"],
    difficulty: "advanced",
    source_type: "archive_librivox",
    source_key: "archive_librivox:count-monte-cristo:academic",
    rights: "public_domain",
    lesson_limit: 5,
    media_kind: "audio",
  },
  {
    archive_id: "moby_dick_librivox",
    title: "Moby Dick, or the Whale",
    subtitle: "Public-domain literary academic lectures",
    description:
      "Herman Melville's Moby Dick, indexed for academic lecture listening with more than forty chapter sessions available at source.",
    category_slug: "academic-lectures",
    instructor_name: "Herman Melville",
    creator_name: "LibriVox",
    topic_tags: ["academic-lectures", "literature", "classic"],
    difficulty: "advanced",
    source_type: "archive_librivox",
    source_key: "archive_librivox:moby-dick:academic",
    rights: "public_domain",
    lesson_limit: 5,
    media_kind: "audio",
  },
  {
    archive_id: "kamtut",
    title: "KaM Tutorial Mission Series",
    subtitle: "Public-domain programming tutorial videos",
    description:
      "Archive.org public-domain tutorial mission videos indexed as programming education with metadata-first browse and tap-only playback.",
    category_slug: "programming",
    instructor_name: "KaM Community",
    creator_name: "Internet Archive",
    topic_tags: ["programming", "tutorial", "video"],
    difficulty: "introductory",
    source_type: "archive_video",
    source_key: "archive_video:kamtut:programming-tutorials",
    rights: "public_domain_mark",
    lesson_limit: 5,
    media_kind: "video",
  },
];

function slugify(value: unknown, fallback = "lecture") {
  const slug = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

  return slug || fallback;
}

function cleanHttpsUrl(value: unknown) {
  const raw = cleanText(value, 2000);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function archiveDownloadUrl(archiveId: string, fileName: string) {
  const segments = String(fileName || "")
    .split("/")
    .map((segment) => encodeURIComponent(segment));
  return `https://archive.org/download/${encodeURIComponent(archiveId)}/${segments.join("/")}`;
}

function lessonTitleFromFile(fileName: string, lessonNumber: number) {
  const base = String(fileName || "")
    .split("/")
    .pop()
    ?.replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .trim();
  return cleanText(base ? `Lesson ${lessonNumber}: ${base}` : `Lesson ${lessonNumber}`, 300);
}

async function fetchArchiveMetadata(archiveId: string) {
  const response = await fetch(`https://archive.org/metadata/${encodeURIComponent(archiveId)}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Archive metadata unavailable (${response.status}) for ${archiveId}.`);
  }
  return (await response.json()) as {
    metadata?: { title?: string; licenseurl?: string };
    files?: Array<{ name?: string; format?: string; size?: string | number }>;
  };
}

function selectArchiveMediaFiles(
  archiveId: string,
  files: Array<{ name?: string; format?: string; size?: string | number }>,
  mediaKind: "audio" | "video",
  lessonLimit: number
) {
  const filtered =
    mediaKind === "audio"
      ? files.filter((file) => file.name && /_64kb\.mp3$/i.test(file.name))
      : files.filter((file) => {
          const name = String(file.name || "");
          return (
            /\.mp4$/i.test(name) &&
            !/\.ia\.mp4$/i.test(name) &&
            !/_thumb|\.gif|\.xml|\.json|\.torrent|\.m3u/i.test(name) &&
            Number(file.size || 0) > 200_000
          );
        });

  const sorted = filtered.sort((left, right) =>
    String(left.name || "").localeCompare(String(right.name || ""), undefined, {
      numeric: true,
      sensitivity: "base",
    })
  );

  return sorted.slice(0, Math.max(1, lessonLimit));
}

export async function buildArchiveSeedMedia(
  def: ArchiveLectureSeedDef
): Promise<LectureMedia[]> {
  const metadata = await fetchArchiveMetadata(def.archive_id);
  const selected = selectArchiveMediaFiles(
    def.archive_id,
    metadata.files || [],
    def.media_kind,
    def.lesson_limit
  );

  if (selected.length === 0) {
    throw new Error(`No playable ${def.media_kind} files found for ${def.archive_id}.`);
  }

  return selected.map((file, index) => {
    const fileName = String(file.name || "");
    const lessonNumber = index + 1;
    const url = archiveDownloadUrl(def.archive_id, fileName);
    const sourceKey = `${def.source_key}:file:${slugify(fileName, String(lessonNumber))}`;

    if (def.media_kind === "audio") {
      return {
        title: lessonTitleFromFile(fileName, lessonNumber) || `Lesson ${lessonNumber}`,
        lesson_number: lessonNumber,
        audio_url: url,
        media_type: "audio" as const,
        mime_type: "audio/mpeg",
        source_key: sourceKey,
      };
    }

    return {
      title: lessonTitleFromFile(fileName, lessonNumber) || `Lesson ${lessonNumber}`,
      lesson_number: lessonNumber,
      video_url: url,
      media_type: "video" as const,
      mime_type: "video/mp4",
      source_key: sourceKey,
    };
  });
}

export async function resolveLectureSeeds(options?: {
  limit?: number;
  offset?: number;
}): Promise<LectureSeed[]> {
  const offset = Math.max(0, Math.floor(Number(options?.offset || 0)));
  const limit = Math.max(0, Math.floor(Number(options?.limit || 0)));
  const defs =
    offset > 0 || limit > 0
      ? ARCHIVE_SEED_DEFS.slice(offset, limit > 0 ? offset + limit : undefined)
      : ARCHIVE_SEED_DEFS;

  const seeds: LectureSeed[] = [];
  for (const def of defs) {
    const media = await buildArchiveSeedMedia(def);
    seeds.push({
      title: def.title,
      subtitle: def.subtitle,
      description: def.description,
      category_slug: def.category_slug,
      instructor_name: def.instructor_name,
      speaker_name: def.speaker_name,
      creator_name: def.creator_name,
      topic_tags: def.topic_tags,
      difficulty: def.difficulty,
      artwork_url: `https://archive.org/services/img/${encodeURIComponent(def.archive_id)}`,
      source_type: def.source_type,
      source_url: `https://archive.org/details/${encodeURIComponent(def.archive_id)}`,
      source_key: def.source_key,
      rights: def.rights,
      media,
    });
  }

  return seeds;
}

async function seedCategories() {
  const rows = LECTURE_CATEGORIES.map((category) => ({
    name: category.name,
    slug: category.slug,
    sort_order: category.sort_order,
    is_active: true,
  }));

  const { error } = await supabaseAdmin
    .from("lecture_categories")
    .upsert(rows, { onConflict: "slug" });

  if (error) throw error;
  return rows.length;
}

export function describeLectureSeedCatalog() {
  return {
    source: "curated_public_domain",
    license: "Public-domain/open remote media URLs, metadata only; no downloads",
    categories: LECTURE_CATEGORIES.map((category) => category.slug),
    seeds: ARCHIVE_SEED_DEFS.length,
    archive_programs: ARCHIVE_SEED_DEFS.map((seed) => ({
      archive_id: seed.archive_id,
      category_slug: seed.category_slug,
      lesson_limit: seed.lesson_limit,
      media_kind: seed.media_kind,
      source_key: seed.source_key,
    })),
  };
}

export async function ingestLectureSeedCatalog(
  options: {
    dry_run?: boolean;
    limit?: number;
    offset?: number;
  } = {}
): Promise<LectureSeedIngestResult> {
  const dryRun = options.dry_run === true;
  const seeds = await resolveLectureSeeds({
    limit: options.limit,
    offset: options.offset,
  });
  const result: LectureSeedIngestResult = {
    success: true,
    dry_run: dryRun,
    categories_checked: 0,
    items_inserted: 0,
    items_updated: 0,
    files_inserted: 0,
    files_updated: 0,
    skipped: 0,
    errors: [],
  };

  if (!dryRun) {
    result.categories_checked = await seedCategories();
  } else {
    result.categories_checked = LECTURE_CATEGORIES.length;
  }

  for (const seed of seeds) {
    try {
      const playableMedia = seed.media.filter(
        (file) => cleanHttpsUrl(file.audio_url) || cleanHttpsUrl(file.video_url)
      );
      if (playableMedia.length === 0) {
        result.skipped += 1;
        continue;
      }

      if (dryRun) {
        result.skipped += 1;
        continue;
      }

      const { data: existing } = await supabaseAdmin
        .from("lecture_items")
        .select("id")
        .eq("source_key", seed.source_key)
        .maybeSingle();

      const payload = {
        slug: slugify(`${seed.title}-${seed.category_slug}`, "lecture"),
        title: seed.title,
        subtitle: cleanText(seed.subtitle, 300),
        description: cleanText(seed.description, 4000),
        instructor_name: cleanText(seed.instructor_name, 200),
        speaker_name: cleanText(seed.speaker_name, 200),
        creator_name: cleanText(seed.creator_name, 200),
        category_slug: seed.category_slug,
        categories: [seed.category_slug],
        topic_tags: seed.topic_tags,
        difficulty: cleanText(seed.difficulty, 80),
        lesson_count: playableMedia.length,
        artwork_url: cleanHttpsUrl(seed.artwork_url),
        cover_url: cleanHttpsUrl(seed.artwork_url),
        language: seed.category_slug === "language-learning" ? "English" : "English",
        source_type: seed.source_type,
        source_url: cleanHttpsUrl(seed.source_url),
        source_key: seed.source_key,
        source_name: seed.creator_name || seed.source_type,
        source_identifier: seed.source_key,
        license_type: seed.rights,
        rights: seed.rights,
        rights_status: seed.rights,
        status: "approved",
        playable_status: "playable",
        playback_status: "playable",
        is_active: true,
        is_public: true,
        is_verified: true,
        is_mature: false,
        published_at: new Date().toISOString(),
        last_checked_at: new Date().toISOString(),
      };

      const { data: lecture, error } = await supabaseAdmin
        .from("lecture_items")
        .upsert(payload, { onConflict: "source_key" })
        .select("id")
        .single();

      if (error) throw error;
      if (existing?.id) result.items_updated += 1;
      else result.items_inserted += 1;

      for (const [index, file] of playableMedia.entries()) {
        const { data: existingFile } = await supabaseAdmin
          .from("lecture_files")
          .select("id")
          .eq("source_key", file.source_key)
          .maybeSingle();

        const filePayload = {
          item_id: lecture.id,
          lecture_item_id: lecture.id,
          title: cleanText(file.title, 300),
          position: file.lesson_number,
          lesson_number: file.lesson_number,
          audio_url: cleanHttpsUrl(file.audio_url),
          video_url: cleanHttpsUrl(file.video_url),
          media_type: file.media_type,
          mime_type: cleanText(file.mime_type, 120),
          duration_seconds: file.duration_seconds || null,
          is_primary: index === 0,
          playable_status: "playable",
          playback_status: "playable",
          is_active: true,
          is_verified: true,
          source_file_identifier: file.source_key,
          source_key: file.source_key,
        };

        const { error: fileError } = await supabaseAdmin
          .from("lecture_files")
          .upsert(filePayload, { onConflict: "source_key" });

        if (fileError) throw fileError;
        if (existingFile?.id) result.files_updated += 1;
        else result.files_inserted += 1;
      }
    } catch (error) {
      result.errors.push({
        source_key: seed.source_key,
        title: seed.title,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  result.success = result.errors.length === 0;
  return result;
}
