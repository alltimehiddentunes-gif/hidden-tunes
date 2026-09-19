import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
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

async function main() {
const { supabaseAdmin } = await import("../lib/supabaseAdmin");
const targetId = "fe0dd05b-caf5-4214-8910-34456c182e41";

const { data: book, error: bookError } = await supabaseAdmin
  .from("audiobooks")
  .select("id,slug,title,author_name,source_type,source_id,source_key,chapter_count,status,is_active,playback_status")
  .eq("id", targetId)
  .single();
if (bookError) throw bookError;

const { data: directChapters, error: directError } = await supabaseAdmin
  .from("audiobook_chapters")
  .select("id,audiobook_id,title,chapter_number,source_key,is_active")
  .eq("audiobook_id", targetId)
  .order("chapter_number")
  .limit(200);
if (directError) throw directError;

const sourceId = String(book?.source_id || "");
const sourceKey = String(book?.source_key || "");
const { data: similarBooks, error: similarError } = await supabaseAdmin
  .from("audiobooks")
  .select("id,slug,title,source_type,source_id,source_key,chapter_count")
  .or(`title.ilike.%Faerie Queene%,source_id.eq.${sourceId || "__missing__"}`)
  .limit(30);
if (similarError) throw similarError;

const candidateBookIds = (similarBooks || []).map((row) => row.id);
const { data: candidateChapters, error: candidateError } = candidateBookIds.length
  ? await supabaseAdmin
      .from("audiobook_chapters")
      .select("id,audiobook_id,title,chapter_number,source_key,is_active")
      .in("audiobook_id", candidateBookIds)
      .order("audiobook_id")
      .order("chapter_number")
      .limit(500)
  : { data: [], error: null };
if (candidateError) throw candidateError;

const report = {
  generatedAt: new Date().toISOString(),
  target: book,
  targetRelationshipRows: directChapters?.length || 0,
  sourceIdentity: { sourceId, sourceKey },
  similarBooks,
  chapterCountsByBook: Object.fromEntries(candidateBookIds.map((id) => [id, (candidateChapters || []).filter((row) => row.audiobook_id === id).length])),
  candidateChapterSamples: (candidateChapters || []).slice(0, 60),
};
const out = path.join(ROOT, "reports", "audiobook-relationship-diagnosis.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
