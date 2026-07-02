import type { MotivationGrowthCandidate } from "@/lib/motivationHealth";

const ARCHIVE_SEARCH_URL = "https://archive.org/advancedsearch.php";
const ARCHIVE_METADATA_URL = "https://archive.org/metadata";

const ARCHIVE_QUERIES = [
  '(subject:"motivational speaking" OR subject:motivation OR subject:inspirational OR subject:"self help" OR subject:"personal development") AND mediatype:movies',
  '(subject:speeches OR subject:"public speaking" OR subject:"commencement address") AND mediatype:movies',
  'collection:prelinger AND (subject:education OR subject:guidance OR subject:inspiration) AND mediatype:movies',
  'collection:opensource_movies AND (subject:motivation OR subject:inspiration OR subject:success)',
];

const SUBCATEGORY_RULES: Array<{ pattern: RegExp; subcategory: string }> = [
  { pattern: /\bgym|fitness|workout|exercise\b/i, subcategory: "Gym motivation" },
  { pattern: /\bstudy|learning|education|school\b/i, subcategory: "Study motivation" },
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
};

type ArchiveFile = {
  name?: string;
  format?: string;
  size?: string;
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
    for (const entry of subject) {
      const cleaned = normalizeText(entry);
      if (cleaned) values.add(cleaned);
    }
  } else {
    const cleaned = normalizeText(subject);
    if (cleaned) values.add(cleaned);
  }
  return [...values];
}

function inferSubcategory(title: string, subjects: string[]) {
  const haystack = `${title} ${subjects.join(" ")}`;
  for (const rule of SUBCATEGORY_RULES) {
    if (rule.pattern.test(haystack)) return rule.subcategory;
  }
  return "Motivation";
}

function pickArchiveVideoFile(files: ArchiveFile[]) {
  const candidates = files
    .filter((file) => {
      const name = normalizeText(file.name).toLowerCase();
      const format = normalizeText(file.format).toLowerCase();
      if (!name || name.endsWith(".xml") || name.endsWith(".torrent")) return false;
      return (
        name.endsWith(".mp4") ||
        name.endsWith(".webm") ||
        name.endsWith(".m4v") ||
        format.includes("h.264") ||
        format.includes("mpeg4") ||
        format.includes("matroska")
      );
    })
    .map((file) => ({
      name: normalizeText(file.name),
      size: Number(file.size || 0),
    }))
    .filter((file) => file.name);

  candidates.sort((a, b) => {
    const aMp4 = a.name.toLowerCase().endsWith(".mp4") ? 1 : 0;
    const bMp4 = b.name.toLowerCase().endsWith(".mp4") ? 1 : 0;
    if (aMp4 !== bMp4) return bMp4 - aMp4;
    return a.size - b.size;
  });

  return candidates[0]?.name || null;
}

async function fetchArchiveSearchPage(query: string, page: number, rows: number) {
  const params = new URLSearchParams({
    q: query,
    fl: "identifier,title,description,subject,creator,language",
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
        signal: AbortSignal.timeout(45_000),
      });
      if (!response.ok) {
        throw new Error(`Archive search failed (${response.status}).`);
      }

      const payload = (await response.json()) as {
        response?: { docs?: ArchiveSearchDoc[] };
      };
      return payload.response?.docs || [];
    } catch (error) {
      if (attempt >= 2) throw error;
      await sleep(500 * (attempt + 1));
    }
  }

  return [];
}

async function fetchArchiveCandidate(doc: ArchiveSearchDoc) {
  const identifier = normalizeText(doc.identifier);
  const title = normalizeText(doc.title);
  if (!identifier || !title) return null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(
        `${ARCHIVE_METADATA_URL}/${encodeURIComponent(identifier)}`,
        {
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal: AbortSignal.timeout(45_000),
        }
      );
      if (!response.ok) return null;

      const payload = (await response.json()) as {
        files?: ArchiveFile[];
        metadata?: { creator?: string | string[]; language?: string | string[] };
      };

      const fileName = pickArchiveVideoFile(payload.files || []);
      if (!fileName) return null;

      const subjects = collectSubjects(doc);
      const subcategory = inferSubcategory(title, subjects);
      const creator = payload.metadata?.creator;
      const channelName = Array.isArray(creator)
        ? normalizeText(creator[0])
        : normalizeText(creator);
      const languageValue = payload.metadata?.language;
      const language = Array.isArray(languageValue)
        ? normalizeText(languageValue[0])
        : normalizeText(languageValue);

      const sourceUrl = `https://archive.org/download/${encodeURIComponent(
        identifier
      )}/${encodeURIComponent(fileName)}`;

      return {
        source_type: "archive_video",
        source_id: identifier,
        source_url: sourceUrl,
        embed_url: `https://archive.org/embed/${encodeURIComponent(identifier)}`,
        title,
        description: normalizeText(doc.description) || null,
        thumbnail_url: `https://archive.org/services/img/${encodeURIComponent(identifier)}`,
        channel_name: channelName || "Internet Archive",
        category: "Motivation",
        subcategory,
        tags: ["Motivation", subcategory, ...subjects.slice(0, 4)],
        language: language || "English",
        region: "US",
        source_key: `archive:${identifier}`,
      } satisfies MotivationGrowthCandidate;
    } catch {
      if (attempt >= 1) return null;
      await sleep(400);
    }
  }

  return null;
}

export async function buildArchiveMotivationCandidates(options?: {
  target?: number;
  rowsPerPage?: number;
  maxPagesPerQuery?: number;
  concurrency?: number;
}) {
  const target = options?.target ?? 6000;
  const rowsPerPage = options?.rowsPerPage ?? 100;
  const maxPagesPerQuery = options?.maxPagesPerQuery ?? 60;
  const concurrency = options?.concurrency ?? 4;

  const candidates: MotivationGrowthCandidate[] = [];
  const seen = new Set<string>();

  for (const query of ARCHIVE_QUERIES) {
    for (let page = 1; page <= maxPagesPerQuery && candidates.length < target; page += 1) {
      const docs = await fetchArchiveSearchPage(query, page, rowsPerPage);
      if (docs.length === 0) break;

      for (let index = 0; index < docs.length && candidates.length < target; index += concurrency) {
        const slice = docs.slice(index, index + concurrency);
        const resolved = await Promise.all(slice.map((doc) => fetchArchiveCandidate(doc)));

        for (const candidate of resolved) {
          if (!candidate || seen.has(candidate.source_key || candidate.source_id)) continue;
          seen.add(candidate.source_key || candidate.source_id);
          candidates.push(candidate);
          if (candidates.length >= target) break;
        }

        await sleep(120);
      }

      await sleep(200);
    }
  }

  return candidates;
}
