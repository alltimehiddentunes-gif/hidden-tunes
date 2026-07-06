import { LECTURE_CATEGORIES } from "@/lib/lectureCatalog";
import { cleanText } from "@/lib/tvCatalog";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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
  media: Array<{
    title: string;
    lesson_number: number;
    audio_url?: string;
    video_url?: string;
    media_type: "audio" | "video";
    mime_type?: string;
    duration_seconds?: number;
    source_key: string;
  }>;
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

const LECTURE_SEEDS: LectureSeed[] = [
  {
    title: "Captains of Industry: Business Lessons",
    subtitle: "Public-domain business leadership readings",
    description:
      "Public-domain business and industry lessons from James Parton's Captains of Industry, indexed as metadata-first educational listening.",
    category_slug: "business",
    instructor_name: "James Parton",
    creator_name: "LibriVox",
    topic_tags: ["business", "industry", "leadership"],
    difficulty: "introductory",
    artwork_url: "https://archive.org/services/img/captainsofindustry_1110_librivox",
    source_type: "archive_librivox",
    source_url: "https://archive.org/details/captainsofindustry_1110_librivox",
    source_key: "archive_librivox:captainsofindustry:business-lessons",
    rights: "public_domain",
    media: [
      {
        title: "Business Lesson 1",
        lesson_number: 1,
        audio_url:
          "https://archive.org/download/captainsofindustry_1110_librivox/captainsofindustry_01_parton_64kb.mp3",
        media_type: "audio",
        mime_type: "audio/mpeg",
        source_key: "archive_librivox:captainsofindustry:file:01",
      },
    ],
  },
  {
    title: "How to Study Architecture",
    subtitle: "Public-domain design education",
    description:
      "A public-domain educational reading about architecture and design study, indexed for metadata-first discovery.",
    category_slug: "design",
    instructor_name: "Charles H. Caffin",
    creator_name: "LibriVox",
    topic_tags: ["design", "architecture", "study"],
    difficulty: "introductory",
    artwork_url: "https://archive.org/services/img/howtostudyarchitecture_1906_librivox",
    source_type: "archive_librivox",
    source_url: "https://archive.org/details/howtostudyarchitecture_1906_librivox",
    source_key: "archive_librivox:howtostudyarchitecture:design",
    rights: "public_domain",
    media: [
      {
        title: "Architecture Study Lesson 1",
        lesson_number: 1,
        audio_url:
          "https://archive.org/download/howtostudyarchitecture_1906_librivox/howtostudyarchitecture_01_caffin_64kb.mp3",
        media_type: "audio",
        mime_type: "audio/mpeg",
        source_key: "archive_librivox:howtostudyarchitecture:file:01",
      },
    ],
  },
  {
    title: "The Art of Public Speaking",
    subtitle: "Public-domain communication tutorials",
    description:
      "Public-domain communication and speaking lessons from Dale Carnegie and J. Berg Esenwein, indexed for tutorial-style listening.",
    category_slug: "tutorials",
    instructor_name: "Dale Carnegie",
    speaker_name: "J. Berg Esenwein",
    creator_name: "LibriVox",
    topic_tags: ["tutorials", "communication", "public-speaking"],
    difficulty: "introductory",
    artwork_url: "https://archive.org/services/img/art_of_public_speaking_0908_librivox",
    source_type: "archive_librivox",
    source_url: "https://archive.org/details/art_of_public_speaking_0908_librivox",
    source_key: "archive_librivox:art-of-public-speaking:tutorials",
    rights: "public_domain",
    media: [
      {
        title: "Public Speaking Lesson 1",
        lesson_number: 1,
        audio_url:
          "https://archive.org/download/art_of_public_speaking_0908_librivox/art_of_public_speaking_01_carnegie_64kb.mp3",
        media_type: "audio",
        mime_type: "audio/mpeg",
        source_key: "archive_librivox:art-of-public-speaking:file:01",
      },
    ],
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
    seeds: LECTURE_SEEDS.length,
  };
}

export async function ingestLectureSeedCatalog(options: {
  dry_run?: boolean;
  limit?: number;
  offset?: number;
} = {}): Promise<LectureSeedIngestResult> {
  const dryRun = options.dry_run === true;
  const offset = Math.max(0, Math.floor(Number(options.offset || 0)));
  const limit = Math.max(0, Math.floor(Number(options.limit || 0)));
  const seeds =
    offset > 0 || limit > 0
      ? LECTURE_SEEDS.slice(offset, limit > 0 ? offset + limit : undefined)
      : LECTURE_SEEDS;
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
        language: "English",
        source_type: seed.source_type,
        source_url: cleanHttpsUrl(seed.source_url),
        source_key: seed.source_key,
        rights: seed.rights,
        status: "approved",
        playback_status: "playable",
        is_active: true,
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
          title: cleanText(file.title, 300),
          lesson_number: file.lesson_number,
          audio_url: cleanHttpsUrl(file.audio_url),
          video_url: cleanHttpsUrl(file.video_url),
          media_type: file.media_type,
          mime_type: cleanText(file.mime_type, 120),
          duration_seconds: file.duration_seconds || null,
          is_primary: index === 0,
          playback_status: "playable",
          is_active: true,
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
