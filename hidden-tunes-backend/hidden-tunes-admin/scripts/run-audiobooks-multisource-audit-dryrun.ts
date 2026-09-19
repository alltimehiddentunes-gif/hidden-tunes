/**
 * Audiobooks multi-source audit + bounded dry-run.
 * READ-ONLY against production Supabase REST + public provider APIs.
 * No production writes. No deploy. No commit. No npm install required.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");
const outDir = path.join(adminRoot, "data", "audiobooks-multisource");

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

loadEnvFile(path.join(adminRoot, ".env.production"));
loadEnvFile(path.join(adminRoot, ".env.local"));
loadEnvFile(path.join(adminRoot, ".env"));

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function writeJson(name: string, value: unknown) {
  ensureDir(outDir);
  const target = path.join(outDir, name);
  fs.writeFileSync(target, JSON.stringify(value, null, 2));
  return target;
}

function bump(map: Record<string, number>, key: string | null | undefined, by = 1) {
  const k = (key && String(key).trim()) || "(empty)";
  map[k] = (map[k] || 0) + by;
}

function gitProof(cwd: string) {
  try {
    return {
      root: execSync("git rev-parse --show-toplevel", { cwd }).toString().trim(),
      branch: execSync("git branch --show-current", { cwd }).toString().trim(),
      head: execSync("git rev-parse HEAD", { cwd }).toString().trim(),
      status: execSync("git status -sb", { cwd }).toString().trim().split(/\r?\n/).slice(0, 8),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function isPlayableBook(row: Record<string, unknown>) {
  const status = String(row.status || "").toLowerCase();
  const playback = String(row.playback_status || "").toLowerCase();
  return (
    row.is_active === true &&
    (status === "approved" || status === "active" || status === "" || !status) &&
    playback === "playable"
  );
}

function classifyLicence(row: Record<string, unknown>) {
  const blob = [row.license_type, row.rights, row.license_url, row.rights_evidence]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!blob.trim()) return "unknown";
  if (
    blob.includes("public domain") ||
    blob.includes("public_domain") ||
    blob.includes("pd-") ||
    /\bpd\b/.test(blob) ||
    blob.includes("librivox")
  ) {
    return "public_domain_or_librivox";
  }
  if (
    blob.includes("creative commons") ||
    blob.includes("cc-by") ||
    blob.includes("cc0") ||
    blob.includes("cc by")
  ) {
    return "creative_commons";
  }
  return "other_or_unparsed";
}

async function supabaseSelect(
  table: string,
  columns: string,
  opts?: { eq?: Record<string, string>; limit?: number; offset?: number }
) {
  const base = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  const params = new URLSearchParams();
  params.set("select", columns);
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (opts?.offset != null) params.set("offset", String(opts.offset));
  if (opts?.eq) {
    for (const [k, v] of Object.entries(opts.eq)) params.set(k, `eq.${v}`);
  }
  const url = `${base.replace(/\/$/, "")}/rest/v1/${table}?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: "count=exact",
    },
    signal: AbortSignal.timeout(60_000),
  });
  const contentRange = res.headers.get("content-range");
  const text = await res.text();
  if (!res.ok) throw new Error(`${table} ${res.status}: ${text.slice(0, 400)}`);
  const data = text ? JSON.parse(text) : [];
  let total: number | null = null;
  if (contentRange && contentRange.includes("/")) {
    const t = Number(contentRange.split("/")[1]);
    if (Number.isFinite(t)) total = t;
  }
  return { data: data as Record<string, unknown>[], total, status: res.status };
}

async function pageAll(table: string, columns: string, pageSize = 1000) {
  const rows: Record<string, unknown>[] = [];
  let total: number | null = null;
  for (let offset = 0; ; offset += pageSize) {
    const page = await supabaseSelect(table, columns, { limit: pageSize, offset });
    if (total == null) total = page.total;
    rows.push(...page.data);
    if (page.data.length < pageSize) break;
    if (total != null && rows.length >= total) break;
  }
  return { rows, total: total ?? rows.length };
}

async function probeUrl(url: string, timeoutMs = 12_000) {
  try {
    const head = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (head.ok) {
      return {
        ok: true,
        status: head.status,
        contentType: head.headers.get("content-type"),
        method: "HEAD",
      };
    }
    const get = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-1023" },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return {
      ok: get.ok || get.status === 206,
      status: get.status,
      contentType: get.headers.get("content-type"),
      method: "GET_RANGE",
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      contentType: null,
      method: "ERROR",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function dryRunGutenbergHuman(limit: number) {
  const discovered: Array<Record<string, unknown>> = [];
  const rejected: Array<Record<string, unknown>> = [];
  const htmlRes = await fetch("https://www.gutenberg.org/browse/categories/1", {
    signal: AbortSignal.timeout(45_000),
    headers: { "User-Agent": "HiddenTunesAudiobookAudit/1.0 (dry-run; admin.hiddentunes.com)" },
  });
  const html = await htmlRes.text();
  const ids = [...html.matchAll(/\/ebooks\/(\d+)/g)].map((m) => m[1]);
  const uniqueIds = [...new Set(ids)];
  const sampleIds = uniqueIds.slice(0, limit);

  for (const id of sampleIds) {
    const metaUrl = `https://www.gutenberg.org/ebooks/${id}`;
    let audioUrl: string | null = null;
    let title: string | null = null;
    let author: string | null = null;
    try {
      const page = await fetch(metaUrl, {
        signal: AbortSignal.timeout(25_000),
        headers: { "User-Agent": "HiddenTunesAudiobookAudit/1.0 (dry-run)" },
      });
      const body = await page.text();
      title =
        body.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)?.[1] ||
        body.match(/<h1[^>]*itemprop="name"[^>]*>([^<]+)/i)?.[1] ||
        null;
      author =
        body.match(/itemprop="creator"[^>]*>[\s\S]*?<a[^>]*>([^<]+)/i)?.[1]?.trim() || null;
      const mp3Matches = [
        ...body.matchAll(/https?:\/\/www\.gutenberg\.org\/(?:files|cache)\/[^"'<\s]+\.mp3/gi),
      ].map((m) => m[0]);
      const oggMatches = [
        ...body.matchAll(/https?:\/\/www\.gutenberg\.org\/(?:files|cache)\/[^"'<\s]+\.ogg/gi),
      ].map((m) => m[0]);
      audioUrl = mp3Matches[0] || oggMatches[0] || null;
      // Also relative /files/ links
      if (!audioUrl) {
        const rel = body.match(/\/files\/\d+\/[^"'<\s]+\.mp3/i);
        if (rel) audioUrl = `https://www.gutenberg.org${rel[0]}`;
      }
      const probe = audioUrl ? await probeUrl(audioUrl) : null;
      const item = {
        provider: "project_gutenberg_human",
        providerBookId: id,
        title,
        author,
        sourceUrl: metaUrl,
        audioSampleUrl: audioUrl,
        chapterAudioUrlsFound: mp3Matches.length + oggMatches.length,
        narrationType: "human_volunteer",
        licence: "Project Gutenberg; US public domain for underlying text — territory metadata required",
        rightsTerritory: "US_PD_default_not_worldwide",
        probe,
      };
      if (!audioUrl) rejected.push({ ...item, reason: "no_audio_url_on_ebook_page" });
      else if (!probe?.ok) rejected.push({ ...item, reason: "audio_probe_failed" });
      else discovered.push(item);
    } catch (error) {
      rejected.push({
        provider: "project_gutenberg_human",
        providerBookId: id,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    provider: "project_gutenberg_human",
    requested: limit,
    categoryPageStatus: htmlRes.status,
    uniqueIdsOnCategoryPage: uniqueIds.length,
    sampled: sampleIds.length,
    normalizedOk: discovered.length,
    rejected: rejected.length,
    discovered: discovered.slice(0, 80),
    rejectedSample: rejected.slice(0, 40),
  };
}

async function dryRunGutenbergOpen(limit: number) {
  const discovered: Array<Record<string, unknown>> = [];
  const rejected: Array<Record<string, unknown>> = [];
  const queries = [
    "https://archive.org/advancedsearch.php?q=(collection%3Agutenberg%20OR%20collection%3Aopensource_audio)%20AND%20(subject%3Aaudiobook%20OR%20title%3Aaudiobook%20OR%20description%3A%22neural%20text%20to%20speech%22%20OR%20description%3A%22AI-generated%22)%20AND%20mediatype%3Aaudio&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=licenseurl&rows=100&page=1&output=json",
    "https://archive.org/advancedsearch.php?q=collection%3Alibrivoxaudio%20AND%20mediatype%3Aaudio&fl[]=identifier&fl[]=title&fl[]=creator&rows=5&page=1&output=json",
  ];

  let docs: any[] = [];
  let usedQuery = "";
  for (const q of queries) {
    try {
      const res = await fetch(q, { signal: AbortSignal.timeout(40_000) });
      const json = await res.json();
      const found = json?.response?.docs || [];
      if (found.length && !q.includes("librivoxaudio")) {
        docs = found;
        usedQuery = q;
        break;
      }
      if (!docs.length) {
        docs = found;
        usedQuery = q;
      }
    } catch {
      /* try next */
    }
  }

  // Prefer dedicated PG open collection search
  try {
    const openQ =
      "https://archive.org/advancedsearch.php?q=%22Project%20Gutenberg%20Open%20Audiobook%22%20OR%20%22gutenberg%20open%20audiobook%22&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=licenseurl&rows=100&page=1&output=json";
    const res = await fetch(openQ, { signal: AbortSignal.timeout(40_000) });
    const json = await res.json();
    if ((json?.response?.docs || []).length) {
      docs = json.response.docs;
      usedQuery = openQ;
    }
  } catch {
    /* keep previous */
  }

  for (const doc of docs.slice(0, Math.min(limit, 60))) {
    const identifier = String(doc.identifier || "");
    if (!identifier) continue;
    try {
      const metaRes = await fetch(`https://archive.org/metadata/${identifier}`, {
        signal: AbortSignal.timeout(25_000),
      });
      const meta = await metaRes.json();
      const files = (meta?.files || []) as Array<Record<string, unknown>>;
      const mp3 = files.find((f) => String(f.name || "").toLowerCase().endsWith(".mp3"));
      const audioUrl = mp3
        ? `https://archive.org/download/${identifier}/${encodeURIComponent(String(mp3.name))}`
        : null;
      if (!audioUrl) {
        rejected.push({ identifier, reason: "no_mp3" });
        continue;
      }
      const probe = await probeUrl(audioUrl);
      const item = {
        provider: "project_gutenberg_open_audiobook",
        providerBookId: identifier,
        title: doc.title || meta?.metadata?.title || null,
        author: doc.creator || meta?.metadata?.creator || null,
        sourceUrl: `https://archive.org/details/${identifier}`,
        audioSampleUrl: audioUrl,
        narrationType: "synthetic",
        licence: meta?.metadata?.licenseurl || doc.licenseurl || "verify_per_item_open_licence",
        rightsTerritory: "US_PD_source_text; confirm mirror redistribution",
        probe,
      };
      if (probe.ok) discovered.push(item);
      else rejected.push({ ...item, reason: "probe_failed" });
    } catch (error) {
      rejected.push({
        identifier,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  let collectionLandingOk = false;
  try {
    const landing = await fetch(
      "https://marhamilresearch4.blob.core.windows.net/gutenberg-public/Website/index.html",
      { signal: AbortSignal.timeout(20_000) }
    );
    collectionLandingOk = landing.ok;
  } catch {
    collectionLandingOk = false;
  }

  return {
    provider: "project_gutenberg_open_audiobook",
    requested: limit,
    usedQuery,
    iaDocsFound: docs.length,
    collectionLandingOk,
    claimedInventoryApprox: 5000,
    normalizedOk: discovered.length,
    rejected: rejected.length,
    discovered: discovered.slice(0, 50),
    rejectedSample: rejected.slice(0, 30),
    note: "Always label narration_type=synthetic. Prefer official PG/Microsoft mirrors with clear terms.",
  };
}

async function dryRunWikimedia(limit: number) {
  const discovered: Array<Record<string, unknown>> = [];
  const rejected: Array<Record<string, unknown>> = [];
  const searchUrl =
    "https://commons.wikimedia.org/w/api.php?" +
    new URLSearchParams({
      action: "query",
      list: "search",
      srsearch: "audiobook",
      srnamespace: "6",
      srlimit: "50",
      format: "json",
    });
  const searchRes = await fetch(searchUrl, {
    signal: AbortSignal.timeout(30_000),
    headers: { "User-Agent": "HiddenTunesAudiobookAudit/1.0 (dry-run; admin.hiddentunes.com)" },
  });
  const searchJson = await searchRes.json();
  const totalHits = searchJson?.query?.searchinfo?.totalhits ?? null;
  const hits = searchJson?.query?.search || [];

  for (const hit of hits.slice(0, limit)) {
    const title = String(hit.title || "");
    const infoUrl =
      "https://commons.wikimedia.org/w/api.php?" +
      new URLSearchParams({
        action: "query",
        titles: title,
        prop: "imageinfo",
        iiprop: "url|size|mime|extmetadata",
        format: "json",
      });
    try {
      const infoRes = await fetch(infoUrl, {
        signal: AbortSignal.timeout(25_000),
        headers: { "User-Agent": "HiddenTunesAudiobookAudit/1.0 (dry-run)" },
      });
      const infoJson = await infoRes.json();
      const page = Object.values(infoJson?.query?.pages || {})[0] as any;
      const ii = page?.imageinfo?.[0];
      if (!ii) {
        rejected.push({ title, reason: "no_imageinfo" });
        continue;
      }
      const mime = String(ii.mime || "");
      if (!mime.startsWith("audio/")) {
        rejected.push({ title, reason: `non_audio_mime:${mime}` });
        continue;
      }
      const ext = ii.extmetadata || {};
      const licenseShort = ext.LicenseShortName?.value || null;
      const licenseUrl = ext.LicenseUrl?.value || null;
      if (!licenseShort && !licenseUrl) {
        rejected.push({ title, reason: "missing_licence_metadata" });
        continue;
      }
      const probe = await probeUrl(String(ii.url));
      const synthetic =
        /ai-generated|speech synthesis|tts|neural/i.test(title) ||
        /ai-generated|speech synthesis/i.test(String(ext.ImageDescription?.value || ""));
      const item = {
        provider: "wikimedia_commons",
        providerBookId: title,
        sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`,
        audioSampleUrl: ii.url,
        mime,
        licence: licenseShort,
        licenceUrl: licenseUrl,
        attribution: ext.Artist?.value || null,
        narrationType: synthetic ? "synthetic" : "unknown_inspect_per_file",
        rightsTerritory: "per_file_licence",
        probe,
        note: "Many Commons hits are single giant files; chapter mapping often required or treat as one-chapter edition",
      };
      if (probe.ok) discovered.push(item);
      else rejected.push({ ...item, reason: "probe_failed" });
    } catch (error) {
      rejected.push({
        title,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    provider: "wikimedia_commons",
    requested: limit,
    searchTotalHits: totalHits,
    sampled: hits.length,
    normalizedOk: discovered.length,
    rejected: rejected.length,
    discovered: discovered.slice(0, 50),
    rejectedSample: rejected.slice(0, 40),
  };
}

async function main() {
  ensureDir(outDir);
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  const projectRef = url.replace(/^https?:\/\//, "").split(".")[0];

  const desktopProof = gitProof(path.join(adminRoot, "..", ".."));
  const mobileProof = gitProof("D:\\HiddenTunes\\Active\\HiddenTunes-CLEAN-1.0.142");

  const apiId = "fe0dd05b-caf5-4214-8910-34456c182e41";
  const matchPage = await supabaseSelect(
    "audiobooks",
    "id,title,source_type,source_key,publisher,playback_status,status",
    { eq: { id: apiId }, limit: 1 }
  );

  console.log("Paging audiobooks...");
  const booksPage = await pageAll("audiobooks", "*");
  console.log("Paging chapters...");
  const chaptersPage = await pageAll("audiobook_chapters", "*");
  console.log("Paging files...");
  const filesPage = await pageAll("audiobook_files", "*");

  let registry: Record<string, unknown>[] = [];
  try {
    registry = (await pageAll(
      "audiobook_source_registry",
      "source_key,source_name,source_type,is_enabled,is_exhausted,accepted_count,rejected_count,metadata"
    )).rows;
  } catch (error) {
    registry = [
      {
        error: error instanceof Error ? error.message : String(error),
      },
    ];
  }

  const books = booksPage.rows;
  const chapters = chaptersPage.rows;
  const files = filesPage.rows;

  const chaptersByBook = new Map<string, Record<string, unknown>[]>();
  for (const ch of chapters) {
    const bid = String(ch.audiobook_id);
    const list = chaptersByBook.get(bid) || [];
    list.push(ch);
    chaptersByBook.set(bid, list);
  }

  const sourceTypeDist: Record<string, number> = {};
  const sourceKeyDist: Record<string, number> = {};
  const languageDist: Record<string, number> = {};
  const categoryDist: Record<string, number> = {};
  const licenceDist: Record<string, number> = {};
  const publisherDist: Record<string, number> = {};

  let playableBooks = 0;
  let missingCovers = 0;
  let incomplete = 0;
  let singleChapter = 0;
  let invalidChapterOrder = 0;
  let brokenAudioBooks = 0;
  const titleAuthorCounts = new Map<string, number>();

  for (const book of books) {
    bump(sourceTypeDist, book.source_type as string);
    bump(sourceKeyDist, (book.source_key as string) || (book.source_type as string));
    bump(languageDist, book.language as string);
    bump(categoryDist, book.category_slug as string);
    bump(licenceDist, classifyLicence(book));
    bump(publisherDist, book.publisher as string);
    if (isPlayableBook(book)) playableBooks += 1;
    if (!book.cover_url) missingCovers += 1;
    if (book.is_complete === false || book.completeness === "incomplete") incomplete += 1;
    const playback = String(book.playback_status || "").toLowerCase();
    if (playback && playback !== "playable") brokenAudioBooks += 1;
    const key =
      (book.normalized_title_author as string) ||
      `${String(book.title || "").toLowerCase().trim()}::${String(book.author_name || "")
        .toLowerCase()
        .trim()}`;
    titleAuthorCounts.set(key, (titleAuthorCounts.get(key) || 0) + 1);
    const bookChapters = chaptersByBook.get(String(book.id)) || [];
    if (bookChapters.length <= 1) singleChapter += 1;
    const nums = bookChapters
      .map((c) => Number(c.sequence_number ?? c.chapter_number))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    if (nums.length >= 2) {
      const dup = new Set(nums).size !== nums.length;
      let gap = false;
      for (let i = 1; i < nums.length; i += 1) {
        if (nums[i] > nums[i - 1] + 1) gap = true;
      }
      if (dup || gap) invalidChapterOrder += 1;
    }
  }

  let playableChapters = 0;
  const chapterDupKeys = new Map<string, number>();
  for (const ch of chapters) {
    const chPlayable =
      ch.is_playable === true ||
      (ch.is_active !== false && String(ch.playback_status || "").toLowerCase() !== "failed");
    if (chPlayable) playableChapters += 1;
    const k = `${ch.audiobook_id}::${ch.chapter_number ?? ch.sequence_number}`;
    chapterDupKeys.set(k, (chapterDupKeys.get(k) || 0) + 1);
  }

  let publicApiTotal: number | null = null;
  try {
    const api = await fetch("https://admin.hiddentunes.com/api/audiobooks?limit=1&page=1", {
      signal: AbortSignal.timeout(30_000),
    });
    const body = await api.json();
    publicApiTotal = body?.pagination?.total ?? null;
  } catch {
    publicApiTotal = null;
  }

  const catalogAudit = {
    generatedAt: new Date().toISOString(),
    workspace: {
      adminRoot,
      desktopGit: desktopProof,
      mobileGit: mobileProof,
      supabaseProjectRef: projectRef,
      supabaseUrl: url,
      productionApi: "https://admin.hiddentunes.com",
      productionOrigin: "VPS 148.230.109.215 nginx+PM2 hidden-tunes-admin",
      apiIdMatchInDb: Boolean(matchPage.data[0]?.id),
      apiMatchSample: matchPage.data[0] || null,
    },
    counts: {
      totalAudiobooks: books.length,
      totalChapters: chapters.length,
      totalFiles: files.length,
      playableAudiobooks: playableBooks,
      playableChapters,
      publicApiListTotal: publicApiTotal,
      missingCovers,
      incompleteBooks: incomplete,
      singleChapterBooks: singleChapter,
      invalidChapterOrderingBooks: invalidChapterOrder,
      brokenOrNonPlayableBooks: brokenAudioBooks,
      duplicateTitleAuthorGroups: [...titleAuthorCounts.values()].filter((n) => n > 1).length,
      duplicateChapterNumberPairs: [...chapterDupKeys.values()].filter((n) => n > 1).length,
    },
    distributions: {
      sourceType: sourceTypeDist,
      sourceKey: Object.fromEntries(
        Object.entries(sourceKeyDist).sort((a, b) => b[1] - a[1]).slice(0, 40)
      ),
      languageTop20: Object.fromEntries(
        Object.entries(languageDist).sort((a, b) => b[1] - a[1]).slice(0, 20)
      ),
      categoryTop20: Object.fromEntries(
        Object.entries(categoryDist).sort((a, b) => b[1] - a[1]).slice(0, 20)
      ),
      licence: licenceDist,
      publisherTop20: Object.fromEntries(
        Object.entries(publisherDist).sort((a, b) => b[1] - a[1]).slice(0, 20)
      ),
    },
    sourceRegistry: registry,
  };
  writeJson("01-catalog-audit.json", catalogAudit);
  console.log("CATALOG", JSON.stringify(catalogAudit.counts, null, 2));
  console.log("SOURCE_TYPE", JSON.stringify(sourceTypeDist));
  console.log("PUBLISHER", JSON.stringify(catalogAudit.distributions.publisherTop20));

  console.log("DRYRUN gutenberg human...");
  const gutHuman = await dryRunGutenbergHuman(100);
  writeJson("02-dryrun-gutenberg-human.json", gutHuman);
  console.log("GUTENBERG_HUMAN", {
    ids: gutHuman.uniqueIdsOnCategoryPage,
    ok: gutHuman.normalizedOk,
    rejected: gutHuman.rejected,
  });

  console.log("DRYRUN gutenberg open...");
  const gutOpen = await dryRunGutenbergOpen(200);
  writeJson("03-dryrun-gutenberg-open.json", gutOpen);
  console.log("GUTENBERG_OPEN", {
    docs: gutOpen.iaDocsFound,
    ok: gutOpen.normalizedOk,
    rejected: gutOpen.rejected,
  });

  console.log("DRYRUN wikimedia...");
  const commons = await dryRunWikimedia(100);
  writeJson("04-dryrun-wikimedia.json", commons);
  console.log("WIKIMEDIA", {
    hits: commons.searchTotalHits,
    ok: commons.normalizedOk,
    rejected: commons.rejected,
  });

  const catalogTitleKeys = new Set(
    books.map((b) =>
      `${String(b.title || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()}::${String(b.author_name || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()}`
    )
  );
  const openOverlap = (gutOpen.discovered || []).filter((d: any) => {
    const key = `${String(d.title || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()}::${String(d.author || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()}`;
    return catalogTitleKeys.has(key);
  }).length;

  const librivoxish =
    (sourceTypeDist.librivox || 0) +
    Object.entries(sourceKeyDist)
      .filter(([k]) => /librivox/i.test(k))
      .reduce((s, [, n]) => s + n, 0);

  const dryRunSummary = {
    generatedAt: new Date().toISOString(),
    noProductionWrites: true,
    whyMostlyLibrivox: {
      publicApiDoesNotFilterLibrivox: true,
      seedImporterHardcodesLibrivox: true,
      adapterRegistryOnlyInternetArchiveFamilies: true,
      noGutenbergAdapter: true,
      noWikimediaAdapter: true,
      historicalBackfillDefaultsSourceTypeToLibrivox: true,
      observedPublisherTop: catalogAudit.distributions.publisherTop20,
      observedSourceType: sourceTypeDist,
      librivoxishCountApprox: librivoxish,
    },
    gutenbergHuman: {
      categoryIdsVisible: gutHuman.uniqueIdsOnCategoryPage,
      sampled: gutHuman.sampled,
      playableSample: gutHuman.normalizedOk,
      rejected: gutHuman.rejected,
    },
    gutenbergOpen: {
      iaDocsFound: gutOpen.iaDocsFound,
      playableSample: gutOpen.normalizedOk,
      rejected: gutOpen.rejected,
      titleAuthorExactOverlapWithCatalog: openOverlap,
      collectionLandingOk: gutOpen.collectionLandingOk,
    },
    wikimediaCommons: {
      searchTotalHits: commons.searchTotalHits,
      playableSample: commons.normalizedOk,
      rejected: commons.rejected,
    },
    estimatedExpansionForecast: {
      gutenbergHumanReadApprox: Math.max(gutHuman.uniqueIdsOnCategoryPage, 662),
      gutenbergOpenSyntheticApprox: 5000,
      wikimediaAudioSearchHits: commons.searchTotalHits,
      realisticQualityFirstNetNew:
        "Human PG first (~hundreds playable complete editions), then selected Commons human editions, then staged synthetic Open titles with clear labels; target thousands over batches, not a single dump.",
    },
  };
  writeJson("05-dryrun-summary.json", dryRunSummary);
  console.log("DONE", outDir);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
