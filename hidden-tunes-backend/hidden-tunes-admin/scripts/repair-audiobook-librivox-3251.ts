import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const TARGET_BOOK_ID = "fe0dd05b-caf5-4214-8910-34456c182e41";
const SOURCE_ID = "3251";
const SOURCE_KEY = `librivox:book:${SOURCE_ID}`;
const APPLY = process.argv.includes("--apply");

for (const name of [".env.production", ".env.local", ".env"]) {
  const file = path.join(ROOT, name);
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const at = trimmed.indexOf("=");
    if (at < 1) continue;
    const key = trimmed.slice(0, at).trim();
    let value = trimmed.slice(at + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}

function seconds(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  if (/^\d+(?:\.\d+)?$/.test(raw)) return Math.round(Number(raw));
  const parts = raw.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  return parts.reduce((sum, part) => sum * 60 + part, 0);
}

async function main() {
  const { supabaseAdmin } = await import("../lib/supabaseAdmin");
  const api = new URL("https://librivox.org/api/feed/audiobooks");
  api.searchParams.set("id", SOURCE_ID);
  api.searchParams.set("format", "json");
  api.searchParams.set("extended", "1");
  const sourceResponse = await fetch(api, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
  if (!sourceResponse.ok) throw new Error(`LibriVox source returned ${sourceResponse.status}`);
  const sourcePayload = await sourceResponse.json() as { books?: Array<Record<string, unknown>> };
  const sourceBook = sourcePayload.books?.find((book) => String(book.id) === SOURCE_ID);
  if (!sourceBook) throw new Error("Exact LibriVox work 3251 not found.");
  const sections = (Array.isArray(sourceBook.sections) ? sourceBook.sections : []) as Array<Record<string, unknown>>;
  const playable = sections.filter((section) => /^https:\/\//i.test(String(section.listen_url || "")));
  if (playable.length !== 13) throw new Error(`Expected 13 exact sections, got ${playable.length}`);

  const { data: book, error: bookError } = await supabaseAdmin
    .from("audiobooks")
    .select("id,title,source_type,source_id,source_key,chapter_count")
    .eq("id", TARGET_BOOK_ID)
    .single();
  if (bookError) throw bookError;
  if (book.source_type !== "librivox" || book.source_id !== SOURCE_ID || book.source_key !== SOURCE_KEY) throw new Error("Canonical production identity mismatch.");

  const [{ count: chaptersBefore }, { count: filesBefore }, existingChapters, existingFiles] = await Promise.all([
    supabaseAdmin.from("audiobook_chapters").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("audiobook_files").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("audiobook_chapters").select("id,source_key").eq("audiobook_id", TARGET_BOOK_ID),
    supabaseAdmin.from("audiobook_files").select("id,source_key").eq("audiobook_id", TARGET_BOOK_ID),
  ]);
  if (existingChapters.error) throw existingChapters.error;
  if (existingFiles.error) throw existingFiles.error;
  if ((existingChapters.data?.length || 0) !== 0 || (existingFiles.data?.length || 0) !== 0) throw new Error("Refusing repair: target already has relationship rows.");

  const probes = [];
  for (const section of playable) {
    const url = String(section.listen_url);
    const response = await fetch(url, { headers: { Range: "bytes=0-1" }, signal: AbortSignal.timeout(30_000) });
    probes.push({ sectionId: String(section.id), status: response.status, contentType: response.headers.get("content-type"), ok: response.status === 200 || response.status === 206 });
  }
  if (!probes.every((probe) => probe.ok)) throw new Error("At least one exact LibriVox chapter URL is not playable.");

  const plan = {
    mode: APPLY ? "apply" : "dry-run",
    bookCanonicalId: TARGET_BOOK_ID,
    bookSourceId: SOURCE_ID,
    bookTitle: book.title,
    currentChapterCount: book.chapter_count,
    expectedChapterSource: SOURCE_KEY,
    currentBrokenRelationship: { chapters: 0, files: 0 },
    exactCause: "aggregate book row persisted without exact-source chapter/file rows",
    proposedExactMutation: "insert 13 exact LibriVox chapter rows, insert 13 matching file rows, reconcile chapter_count to 13",
    rowsAffected: { audiobook_chapters: 13, audiobook_files: 13, audiobooks: 1, total: 27 },
    probes,
  };
  console.log(JSON.stringify(plan, null, 2));
  fs.mkdirSync(path.join(ROOT, "reports"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "reports", `audiobook-3251-${APPLY ? "apply-plan" : "dry-run"}.json`), JSON.stringify(plan, null, 2));
  if (!APPLY) return;

  const chapterPayloads = playable.map((section, index) => ({
    audiobook_id: TARGET_BOOK_ID,
    title: String(section.title || `Faerie Queene Book 4 - Chapter ${index + 1}`).trim(),
    description: "",
    chapter_number: index + 1,
    duration_seconds: seconds(section.playtime),
    source_key: `${SOURCE_KEY}:chapter:${String(section.id)}`,
    is_active: true,
  }));
  const { data: insertedChapters, error: chapterInsertError } = await supabaseAdmin
    .from("audiobook_chapters")
    .insert(chapterPayloads)
    .select("id,source_key,chapter_number,title,duration_seconds");
  if (chapterInsertError) throw chapterInsertError;
  if ((insertedChapters?.length || 0) !== 13) throw new Error("Chapter insert count mismatch.");
  const chapterByKey = new Map(insertedChapters!.map((row) => [row.source_key, row]));
  const filePayloads = playable.map((section, index) => {
    const chapterKey = `${SOURCE_KEY}:chapter:${String(section.id)}`;
    const chapter = chapterByKey.get(chapterKey);
    if (!chapter) throw new Error(`Missing inserted chapter ${chapterKey}`);
    return {
      audiobook_id: TARGET_BOOK_ID,
      chapter_id: chapter.id,
      title: chapter.title,
      audio_url: String(section.listen_url),
      duration_seconds: seconds(section.playtime),
      format: "mp3",
      mime_type: "audio/mpeg",
      is_primary: index === 0,
      playback_status: "playable",
      is_active: true,
      source_key: `${SOURCE_KEY}:file:${String(section.id)}`,
    };
  });
  const { data: insertedFiles, error: fileInsertError } = await supabaseAdmin.from("audiobook_files").insert(filePayloads).select("id,source_key,chapter_id,audio_url");
  if (fileInsertError) throw fileInsertError;
  if ((insertedFiles?.length || 0) !== 13) throw new Error("File insert count mismatch.");
  const { error: updateError } = await supabaseAdmin.from("audiobooks").update({ chapter_count: 13 }).eq("id", TARGET_BOOK_ID);
  if (updateError) throw updateError;

  const [{ count: chaptersAfter }, { count: filesAfter }] = await Promise.all([
    supabaseAdmin.from("audiobook_chapters").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("audiobook_files").select("id", { count: "exact", head: true }),
  ]);
  const result = {
    ...plan,
    insertedChapterIds: insertedChapters!.map((row) => row.id),
    insertedFileIds: insertedFiles!.map((row) => row.id),
    globalCountDelta: { audiobook_chapters: Number(chaptersAfter) - Number(chaptersBefore), audiobook_files: Number(filesAfter) - Number(filesBefore) },
    unrelatedRowsChanged: Number(chaptersAfter) - Number(chaptersBefore) !== 13 || Number(filesAfter) - Number(filesBefore) !== 13,
  };
  fs.writeFileSync(path.join(ROOT, "reports", "audiobook-3251-apply-result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
