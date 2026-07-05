import { AUDIOBOOK_CATEGORIES } from "@/lib/audiobookCatalog";
import {
  evaluateLibriVoxAudiobook,
  evaluateLibriVoxChapterAudio,
} from "@/lib/audiobookAutoApproval";
import { cleanText } from "@/lib/tvCatalog";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const AUDIOBOOK_SEED_DEFAULT_LIMIT = 40;
export const AUDIOBOOK_SEED_MAX_LIMIT = 200;
export const AUDIOBOOK_SEED_DEFAULT_TIMEOUT_MS = 30_000;

export type AudiobookSeedCategorySlug =
  | "fiction"
  | "classics"
  | "biography"
  | "history"
  | "education"
  | "children"
  | "science"
  | "faith"
  | "language-learning";

export const AUDIOBOOK_SEED_CATEGORIES: AudiobookSeedCategorySlug[] = [
  "fiction",
  "classics",
  "biography",
  "history",
  "education",
  "children",
  "science",
  "faith",
  "language-learning",
];

const LIBRIVOX_BASE = "https://librivox.org/api/feed/audiobooks";

type LibriVoxAuthor = {
  id?: string | number;
  first_name?: string;
  last_name?: string;
};

type LibriVoxSection = {
  id?: string | number;
  title?: string;
  listen_url?: string;
  playtime?: string | number;
};

type LibriVoxBook = {
  id?: string | number;
  title?: string;
  description?: string;
  url_librivox?: string;
  url_iarchive?: string;
  url_rss?: string;
  language?: string;
  totaltimesecs?: string | number;
  authors?: LibriVoxAuthor[];
  genres?: Array<{ name?: string } | string>;
  sections?: LibriVoxSection[];
};

export type AudiobookSeedIngestOptions = {
  limit?: number;
  offset?: number;
  categories?: AudiobookSeedCategorySlug[];
  dry_run?: boolean;
  timeout_ms?: number;
};

export type AudiobookSeedIngestResult = {
  success: boolean;
  dry_run: boolean;
  source: "librivox";
  categories_seeded: number;
  books_attempted: number;
  books_imported: number;
  books_skipped: number;
  books_failed: number;
  authors_upserted: number;
  chapters_upserted: number;
  files_upserted: number;
  errors: Array<{
    source_id: string;
    title: string;
    stage?: string;
    table?: string;
    column?: string | null;
    code?: string;
    message: string;
    details?: string | null;
    hint?: string | null;
  }>;
};

type SupabaseLikeError = {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
};

function serializeIngestError(
  error: unknown,
  context: { source_id: string; title: string; stage?: string; table?: string }
): AudiobookSeedIngestResult["errors"][number] {
  const record =
    error && typeof error === "object"
      ? (error as SupabaseLikeError & Record<string, unknown>)
      : {};
  const message =
    typeof record.message === "string"
      ? record.message
      : error instanceof Error
        ? error.message
        : String(error || "Unknown audiobook ingest error.");
  const columnMatch = message.match(/column\s+"?([a-zA-Z0-9_]+)"?/i);

  return {
    source_id: context.source_id,
    title: context.title,
    stage: context.stage,
    table: context.table,
    column: columnMatch?.[1] || null,
    code: typeof record.code === "string" ? record.code : undefined,
    message,
    details: typeof record.details === "string" ? record.details : null,
    hint: typeof record.hint === "string" ? record.hint : null,
  };
}

function slugify(value: unknown, fallback = "audiobook") {
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

function clampLimit(value: unknown) {
  const parsed = Number(value || AUDIOBOOK_SEED_DEFAULT_LIMIT);
  if (!Number.isFinite(parsed) || parsed < 1) return AUDIOBOOK_SEED_DEFAULT_LIMIT;
  return Math.min(AUDIOBOOK_SEED_MAX_LIMIT, Math.floor(parsed));
}

function normalizeCategories(categories?: AudiobookSeedCategorySlug[]) {
  if (!categories?.length) return AUDIOBOOK_SEED_CATEGORIES;
  const allowed = new Set(AUDIOBOOK_SEED_CATEGORIES);
  return categories.filter((category) => allowed.has(category));
}

function categoryToLibriVoxSearch(category: AudiobookSeedCategorySlug) {
  const map: Record<AudiobookSeedCategorySlug, string> = {
    fiction: "fiction",
    classics: "classics",
    biography: "biography",
    history: "history",
    education: "education",
    children: "children",
    science: "science",
    faith: "religion",
    "language-learning": "language",
  };
  return map[category];
}

function normalizeAuthorName(author: LibriVoxAuthor | undefined) {
  const name = [author?.first_name, author?.last_name]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
  return name || "Unknown Author";
}

function normalizeSeconds(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
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

function buildArchiveFallbackCover(book: LibriVoxBook) {
  const archiveUrl = cleanHttpsUrl(book.url_iarchive);
  if (!archiveUrl) return null;
  try {
    const url = new URL(archiveUrl);
    const identifier = url.pathname.split("/").filter(Boolean).pop();
    return identifier
      ? `https://archive.org/services/img/${encodeURIComponent(identifier)}`
      : null;
  } catch {
    return null;
  }
}

function mapGenres(book: LibriVoxBook, category: AudiobookSeedCategorySlug) {
  const genres = Array.isArray(book.genres)
    ? book.genres
        .map((entry) =>
          typeof entry === "string" ? entry : String(entry?.name || "")
        )
        .map((entry) => slugify(entry, "genre"))
        .filter(Boolean)
    : [];

  return Array.from(new Set([category, ...genres])).slice(0, 12);
}

async function fetchLibriVoxBooks(options: {
  category?: AudiobookSeedCategorySlug;
  limit: number;
  offset: number;
  timeoutMs: number;
}) {
  const url = new URL(LIBRIVOX_BASE);
  url.searchParams.set("format", "json");
  url.searchParams.set("extended", "1");
  url.searchParams.set("limit", String(options.limit));
  url.searchParams.set("offset", String(options.offset));
  url.searchParams.set("sort_order", "catalog_date");
  url.searchParams.set("primary_key", "id");
  if (options.category) {
    url.searchParams.set("genre", categoryToLibriVoxSearch(options.category));
  }

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(options.timeoutMs),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`LibriVox API returned ${response.status}`);
  }

  const payload = (await response.json()) as { books?: LibriVoxBook[] };
  return Array.isArray(payload.books) ? payload.books : [];
}

export function describeAudiobookSeedCatalog() {
  return {
    source: "librivox",
    license: "LibriVox public domain audiobooks",
    categories: AUDIOBOOK_SEED_CATEGORIES,
    default_limit: AUDIOBOOK_SEED_DEFAULT_LIMIT,
    max_limit: AUDIOBOOK_SEED_MAX_LIMIT,
  };
}

async function seedCategories() {
  const rows = AUDIOBOOK_CATEGORIES.map((category) => ({
    name: category.name,
    slug: category.slug,
    sort_order: category.sort_order,
    is_active: true,
  }));

  const { error } = await supabaseAdmin
    .from("audiobook_categories")
    .upsert(rows, { onConflict: "slug" });

  if (error) throw error;
  return rows.length;
}

function librivoxBookSourceKey(sourceId: string) {
  return `librivox:book:${sourceId}`;
}

function librivoxAuthorSourceKey(sourceId: string) {
  return `librivox:author:${sourceId}`;
}

function librivoxChapterSourceKey(bookSourceId: string, chapterSourceId: string) {
  return `librivox:book:${bookSourceId}:chapter:${chapterSourceId}`;
}

function librivoxFileSourceKey(bookSourceId: string, chapterSourceId: string) {
  return `librivox:book:${bookSourceId}:file:${chapterSourceId}`;
}

async function upsertAuthor(book: LibriVoxBook) {
  const author = Array.isArray(book.authors) ? book.authors[0] : undefined;
  const sourceId = author?.id ? String(author.id) : `book-${book.id || "unknown"}`;
  const name = normalizeAuthorName(author);
  const sourceKey = librivoxAuthorSourceKey(sourceId);
  const slug = slugify(`${name}-${sourceId}`, "author");

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("audiobook_authors")
    .select("id, name")
    .eq("source_key", sourceKey)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing?.id) return existing as { id: string; name: string };

  const { data, error } = await supabaseAdmin
    .from("audiobook_authors")
    .upsert(
      {
        slug,
        name,
        source_type: "librivox",
        source_id: sourceId,
        source_key: sourceKey,
        is_active: true,
      },
      { onConflict: "source_key" }
    )
    .select("id, name")
    .single();

  if (error) throw error;
  return data as { id: string; name: string };
}

async function upsertBook(book: LibriVoxBook, category: AudiobookSeedCategorySlug) {
  const sourceId = String(book.id || "").trim();
  if (!sourceId) throw new Error("Missing LibriVox book id.");

  const sections = Array.isArray(book.sections) ? book.sections : [];
  const playableSections = sections.filter((section) =>
    cleanHttpsUrl(section.listen_url)
  );
  if (playableSections.length === 0) {
    return { skipped: true as const };
  }

  const author = await upsertAuthor(book);
  const title = cleanText(book.title, 300) || `LibriVox Audiobook ${sourceId}`;
  const slug = slugify(`${title}-${sourceId}`, "audiobook");
  const sourceKey = librivoxBookSourceKey(sourceId);
  const primaryAudioUrl = cleanHttpsUrl(playableSections[0]?.listen_url);
  const approval = evaluateLibriVoxAudiobook({
    title,
    description: cleanText(book.description, 4000),
    playableSectionCount: playableSections.length,
    primaryAudioUrl,
  });

  const bookPayload = {
    slug,
    title,
    description: cleanText(book.description, 4000),
    cover_url: buildArchiveFallbackCover(book),
    author_id: author.id,
    author_name: author.name,
    category_slug: category,
    categories: mapGenres(book, category),
    language: cleanText(book.language, 40),
    publisher: "LibriVox",
    source_type: "librivox",
    source_url: cleanHttpsUrl(book.url_librivox) || cleanHttpsUrl(book.url_rss),
    source_key: sourceKey,
    rights: "public_domain",
    duration_seconds: normalizeSeconds(book.totaltimesecs) || 0,
    chapter_count: playableSections.length,
    status: approval.status,
    playback_status: approval.playback_status,
    is_active: approval.is_active,
    is_verified: approval.is_verified,
    is_mature: false,
    published_at: new Date().toISOString(),
    last_checked_at: new Date().toISOString(),
  };

  const { data: audiobook, error } = await supabaseAdmin
    .from("audiobooks")
    .upsert(bookPayload, { onConflict: "source_key" })
    .select("id")
    .single();

  if (error) throw error;

  let chaptersUpserted = 0;
  let filesUpserted = 0;

  for (let index = 0; index < playableSections.length; index += 1) {
    const section = playableSections[index];
    const chapterSourceId = String(section.id || `${sourceId}-${index + 1}`);
    const audioUrl = cleanHttpsUrl(section.listen_url);
    if (!audioUrl) continue;

    const chapterTitle =
      cleanText(section.title, 300) || `${title} - Chapter ${index + 1}`;
    const chapterSourceKey = librivoxChapterSourceKey(sourceId, chapterSourceId);
    const chapterPayload = {
      audiobook_id: audiobook.id,
      title: chapterTitle,
      chapter_number: index + 1,
      duration_seconds: normalizeSeconds(section.playtime) || 0,
      source_key: chapterSourceKey,
      is_active: true,
    };

    const { data: chapterRow, error: chapterError } = await supabaseAdmin
      .from("audiobook_chapters")
      .upsert(chapterPayload, { onConflict: "source_key" })
      .select("id")
      .single();

    if (chapterError) throw chapterError;
    chaptersUpserted += 1;

    const fileApproval = evaluateLibriVoxChapterAudio(audioUrl);
    const filePayload = {
      audiobook_id: audiobook.id,
      chapter_id: chapterRow.id,
      title: chapterTitle,
      audio_url: audioUrl,
      duration_seconds: normalizeSeconds(section.playtime) || 0,
      format: "mp3",
      mime_type: "audio/mpeg",
      is_primary: index === 0,
      playback_status: fileApproval.playback_status,
      is_active: fileApproval.is_active,
      source_key: librivoxFileSourceKey(sourceId, chapterSourceId),
    };

    const { error: fileError } = await supabaseAdmin
      .from("audiobook_files")
      .upsert(filePayload, { onConflict: "source_key" });

    if (fileError) throw fileError;
    filesUpserted += 1;
  }

  await supabaseAdmin
    .from("audiobooks")
    .update({ chapter_count: chaptersUpserted })
    .eq("id", audiobook.id);

  if (!approval.is_active || chaptersUpserted === 0 || filesUpserted === 0) {
    await supabaseAdmin.from("audiobooks").delete().eq("id", audiobook.id);
    return { skipped: true as const };
  }

  return {
    skipped: false as const,
    authors_upserted: 1,
    chapters_upserted: chaptersUpserted,
    files_upserted: filesUpserted,
  };
}

export async function ingestAudiobookSeedCatalog(
  options: AudiobookSeedIngestOptions = {}
): Promise<AudiobookSeedIngestResult> {
  const dryRun = options.dry_run === true;
  const limit = clampLimit(options.limit);
  const offset = Math.max(0, Math.floor(Number(options.offset || 0)));
  const timeoutMs = Math.max(
    5_000,
    Math.floor(Number(options.timeout_ms || AUDIOBOOK_SEED_DEFAULT_TIMEOUT_MS))
  );
  const categories = normalizeCategories(options.categories);

  const result: AudiobookSeedIngestResult = {
    success: true,
    dry_run: dryRun,
    source: "librivox",
    categories_seeded: 0,
    books_attempted: 0,
    books_imported: 0,
    books_skipped: 0,
    books_failed: 0,
    authors_upserted: 0,
    chapters_upserted: 0,
    files_upserted: 0,
    errors: [],
  };

  if (!dryRun) {
    result.categories_seeded = await seedCategories();
  }

  const perCategoryLimit = Math.max(1, Math.ceil(limit / categories.length));

  for (const category of categories) {
    let books: LibriVoxBook[] = [];
    try {
      try {
        books = await fetchLibriVoxBooks({
          category,
          limit: perCategoryLimit,
          offset,
          timeoutMs,
        });
      } catch {
        books = await fetchLibriVoxBooks({
          limit: perCategoryLimit,
          offset: offset + categories.indexOf(category) * perCategoryLimit,
          timeoutMs,
        });
      }
    } catch (error) {
      result.books_failed += 1;
      result.errors.push(
        serializeIngestError(error, {
          source_id: `category:${category}`,
          title: category,
          stage: "fetch_librivox_books",
        })
      );
      continue;
    }

    for (const book of books) {
      result.books_attempted += 1;
      const sourceId = String(book.id || "");
      const title = cleanText(book.title, 300) || "Untitled LibriVox Audiobook";

      if (dryRun) {
        result.books_skipped += 1;
        continue;
      }

      try {
        const imported = await upsertBook(book, category);
        if (imported.skipped) {
          result.books_skipped += 1;
          continue;
        }

        result.books_imported += 1;
        result.authors_upserted += imported.authors_upserted;
        result.chapters_upserted += imported.chapters_upserted;
        result.files_upserted += imported.files_upserted;
      } catch (error) {
        result.books_failed += 1;
        result.errors.push(
          serializeIngestError(error, {
            source_id: sourceId,
            title,
            stage: "import_audiobook",
          })
        );
      }
    }
  }

  result.success = result.books_failed === 0;
  return result;
}
