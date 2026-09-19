import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = join(ROOT, "data", "pluto-phase2b");
const FRAME_DIR = join(tmpdir(), "hidden-tunes-pluto-phase2-frames");
type Row = Record<string, unknown> & { id: string; source_url: string; source_id: string; title: string; region: string | null; language: string | null; category: string | null };

function extractId(row: Row): string | null {
  const path = String(row.source_url ?? "").match(/\/channel\/([a-f0-9]{24})(?:\/|\?|$)/i)?.[1];
  const jmp = String(row.source_url ?? "").match(/plu-([a-f0-9]{24})\.m3u8/i)?.[1];
  if (path || jmp) return (path || jmp)!.toLowerCase();
  const exact = String(row.source_id ?? "").match(/^[a-f0-9]{24}$/i)?.[0];
  if (exact) return exact.toLowerCase();
  return null;
}

function family(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "jmp2.uk") return "jmp2";
    if (parsed.hostname.endsWith("pluto.tv")) return parsed.pathname.includes("/v2/") ? "pluto_v2" : "pluto_direct";
    return parsed.hostname;
  } catch { return "invalid"; }
}

function dhash(path: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", path, "-vf", "scale=9:8,format=gray", "-frames:v", "1", "-f", "rawvideo", "pipe:1"], { windowsHide: true });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    child.once("exit", (code) => {
      const bytes = Buffer.concat(chunks);
      if (code !== 0 || bytes.length < 72) return resolve(null);
      let bits = "";
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += bytes[y * 9 + x] > bytes[y * 9 + x + 1] ? "1" : "0";
      resolve(BigInt(`0b${bits}`).toString(16).padStart(16, "0"));
    });
    child.once("error", () => resolve(null));
  });
}

async function loadRows(): Promise<Row[]> {
  loadAdminEnv(ROOT);
  const db = getSupabaseAdmin();
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("tv_videos").select("id,source_type,source_id,source_url,title,region,language,category,tags,status,playback_status,is_active,thumbnail_url").range(from, from + 999);
    if (error) throw error;
    rows.push(...((data ?? []) as Row[]));
    if ((data ?? []).length < 1000) break;
  }
  return rows.filter((row) => /pluto/i.test(`${row.title} ${row.source_url} ${row.source_id} ${JSON.stringify(row.tags ?? [])}`));
}

async function main() {
  await mkdir(OUTPUT, { recursive: true });
  const rows = await loadRows();
  const guideResponse = await fetch("https://service-channels.clusters.pluto.tv/v1/guide?appName=web&deviceType=web&deviceModel=web&deviceMake=web", { signal: AbortSignal.timeout(20_000) });
  const guideJson = await guideResponse.json() as { channels?: Array<{ id: string; name: string; slug?: string; categoryID?: string }> };
  const current = new Map((guideJson.channels ?? []).map((channel) => [channel.id.toLowerCase(), channel]));
  const identities = new Map<string, { providerId: string; records: string[]; names: Set<string>; regions: Set<string>; languages: Set<string>; categories: Set<string>; families: Set<string>; currentName: string | null }>();
  let unresolved = 0;
  for (const row of rows) {
    const providerId = extractId(row);
    if (!providerId) { unresolved++; continue; }
    const item = identities.get(providerId) ?? { providerId, records: [], names: new Set(), regions: new Set(), languages: new Set(), categories: new Set(), families: new Set(), currentName: current.get(providerId)?.name ?? null };
    item.records.push(row.id); item.names.add(row.title); if (row.region) item.regions.add(row.region); if (row.language) item.languages.add(row.language); if (row.category) item.categories.add(row.category); item.families.add(family(row.source_url)); identities.set(providerId, item);
  }
  const frameFiles = existsSync(FRAME_DIR) ? (await import("node:fs/promises")).readdir(FRAME_DIR) : Promise.resolve([] as string[]);
  const hashes = [];
  for (const file of await frameFiles) if (/\.jpe?g$/i.test(file)) hashes.push({ file: file.replace(/^[0-9]+-/, "[sample]-"), hash: await dhash(join(FRAME_DIR, file)) });
  const staged = [...identities.values()].map((item) => ({ ...item, names: [...item.names], regions: [...item.regions], languages: [...item.languages], categories: [...item.categories], families: [...item.families], availability: item.currentName ? "CURRENT_PLUTO_ID_PRESENT" : "OLD_OR_REGIONAL_OR_DISCONTINUED", candidates: item.currentName ? [{ provider: "pluto", provenance: "official_public_guide", confidence: "EXACT", validationRequired: true }] : [] }));
  const report = { generatedAt: new Date().toISOString(), productionWrites: 0, existingRecords: rows.length, uniqueCanonicalIdentities: identities.size, unresolvedIdentities: unresolved, currentPlutoIds: staged.filter((item) => item.currentName).length, oldRegionalOrDiscontinued: staged.filter((item) => !item.currentName).length, duplicateAliases: staged.filter((item) => item.names.length > 1).length, regionalVariants: staged.filter((item) => item.regions.length > 1).length, metadataMissing: { language: rows.filter((row) => !row.language).length, region: rows.filter((row) => !row.region).length }, endOfAvailabilityFingerprint: { method: "64-bit perceptual dHash over 9x8 grayscale; compare by Hamming distance; visual layout/OCR remains secondary", classification: "END_OF_AVAILABILITY", samples: hashes } };
  await writeFile(join(OUTPUT, "canonical-map.json"), JSON.stringify(staged, null, 2));
  await writeFile(join(OUTPUT, "phase2b-summary.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
