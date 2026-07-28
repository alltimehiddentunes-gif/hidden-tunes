import fs from "node:fs";
import path from "node:path";

import { listAudiobookAdapterSourceKeys } from "@/lib/audiobookSources/adapterRegistry";
import { INTERNET_ARCHIVE_AUDIOBOOK_QUERIES } from "@/lib/audiobookSources/internetArchiveQueries";
import { tableExists } from "@/lib/audiobookSources/schemaCompat";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type AudiobookSourceRegistryEntry = {
  id: string;
  source_key: string;
  source_name: string;
  source_type: string;
  base_url: string | null;
  rights_policy: string | null;
  default_license: string | null;
  attribution_requirements: string | null;
  supported_languages: string[];
  supported_formats: string[];
  checkpoint_cursor: string | null;
  last_successful_import: string | null;
  last_failed_import: string | null;
  failure_count: number;
  accepted_editions: number;
  rejected_editions: number;
  is_enabled: boolean;
  is_exhausted: boolean;
  catalog_lane?: "general" | "mature";
};

export const AUDIOBOOK_ROTATION_SOURCE_KEYS = [
  "librivox",
  ...listAudiobookAdapterSourceKeys("general"),
] as const;

export const AUDIOBOOK_MATURE_ROTATION_SOURCE_KEYS =
  listAudiobookAdapterSourceKeys("mature");

export type AudiobookRotationSourceKey =
  (typeof AUDIOBOOK_ROTATION_SOURCE_KEYS)[number];

const FS_REGISTRY_PATH = path.join(
  process.cwd(),
  "data",
  "audiobook-source-registry.json"
);

function defaultRegistryEntries(): AudiobookSourceRegistryEntry[] {
  const librivox: AudiobookSourceRegistryEntry = {
    id: "fs-librivox",
    source_key: "librivox",
    source_name: "LibriVox",
    source_type: "api",
    base_url: "https://librivox.org/api/feed/audiobooks",
    rights_policy: "Public domain volunteer readings",
    default_license: "public_domain",
    attribution_requirements: "Credit LibriVox and readers",
    supported_languages: [
      "English",
      "German",
      "French",
      "Spanish",
      "Italian",
      "Portuguese",
    ],
    supported_formats: ["mp3", "ogg"],
    checkpoint_cursor: null,
    last_successful_import: null,
    last_failed_import: null,
    failure_count: 0,
    accepted_editions: 0,
    rejected_editions: 0,
    is_enabled: true,
    is_exhausted: false,
    catalog_lane: "general",
  };

  const archiveEntries = Object.values(INTERNET_ARCHIVE_AUDIOBOOK_QUERIES).map(
    (definition) =>
      ({
        id: `fs-${definition.family}`,
        source_key: definition.sourceKey,
        source_name: definition.sourceName,
        source_type: "archive",
        base_url: "https://archive.org",
        rights_policy: "Public domain / Creative Commons via Internet Archive",
        default_license: "open_license",
        attribution_requirements: "Credit Internet Archive and original rights holders",
        supported_languages: ["English", "Spanish", "French", "German", "Italian"],
        supported_formats: ["mp3", "ogg", "m4a", "flac"],
        checkpoint_cursor: null,
        last_successful_import: null,
        last_failed_import: null,
        failure_count: 0,
        accepted_editions: 0,
        rejected_editions: 0,
        is_enabled: true,
        is_exhausted: false,
        catalog_lane: definition.catalogLane,
      }) satisfies AudiobookSourceRegistryEntry
  );

  return [librivox, ...archiveEntries];
}

function loadFsRegistry(): AudiobookSourceRegistryEntry[] {
  if (!fs.existsSync(FS_REGISTRY_PATH)) {
    const seeded = defaultRegistryEntries();
    fs.mkdirSync(path.dirname(FS_REGISTRY_PATH), { recursive: true });
    fs.writeFileSync(FS_REGISTRY_PATH, JSON.stringify(seeded, null, 2));
    return seeded;
  }
  const raw = JSON.parse(
    fs.readFileSync(FS_REGISTRY_PATH, "utf8")
  ) as AudiobookSourceRegistryEntry[];
  const defaults = defaultRegistryEntries();
  const byKey = new Map(raw.map((entry) => [entry.source_key, entry]));
  for (const entry of defaults) {
    if (!byKey.has(entry.source_key)) byKey.set(entry.source_key, entry);
  }
  const merged = [...byKey.values()];
  fs.writeFileSync(FS_REGISTRY_PATH, JSON.stringify(merged, null, 2));
  return merged;
}

function writeFsRegistry(entries: AudiobookSourceRegistryEntry[]) {
  fs.mkdirSync(path.dirname(FS_REGISTRY_PATH), { recursive: true });
  fs.writeFileSync(FS_REGISTRY_PATH, JSON.stringify(entries, null, 2));
}

export async function listEnabledAudiobookSources(options?: {
  lane?: "general" | "mature" | "all";
}) {
  const lane = options?.lane || "general";
  const hasDb = await tableExists("audiobook_source_registry");

  let entries: AudiobookSourceRegistryEntry[];
  if (hasDb) {
    const { data, error } = await supabaseAdmin
      .from("audiobook_source_registry")
      .select(
        "id, source_key, source_name, source_type, base_url, rights_policy, default_license, attribution_requirements, supported_languages, supported_formats, checkpoint_cursor, last_successful_import, last_failed_import, failure_count, accepted_editions, rejected_editions, is_enabled, is_exhausted, metadata"
      )
      .eq("is_enabled", true)
      .order("accepted_editions", { ascending: true });
    if (error) throw error;
    entries = (data || []).map((row) => {
      const metadata =
        row.metadata && typeof row.metadata === "object"
          ? (row.metadata as Record<string, unknown>)
          : {};
      return {
        ...(row as AudiobookSourceRegistryEntry),
        catalog_lane:
          metadata.catalog_lane === "mature"
            ? "mature"
            : row.source_key.includes("mature")
              ? "mature"
              : "general",
      };
    });
  } else {
    entries = loadFsRegistry().filter((entry) => entry.is_enabled);
  }

  if (lane === "all") return entries;
  return entries.filter((entry) => (entry.catalog_lane || "general") === lane);
}

export async function updateAudiobookSourceRegistry(
  sourceKey: string,
  patch: Partial<{
    checkpoint_cursor: string | null;
    last_successful_import: string;
    last_failed_import: string;
    failure_count: number;
    accepted_editions: number;
    rejected_editions: number;
    is_exhausted: boolean;
  }>
) {
  const hasDb = await tableExists("audiobook_source_registry");
  if (hasDb) {
    const { error } = await supabaseAdmin
      .from("audiobook_source_registry")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("source_key", sourceKey);
    if (error) throw error;
    return;
  }

  const entries = loadFsRegistry();
  const index = entries.findIndex((entry) => entry.source_key === sourceKey);
  if (index < 0) return;
  entries[index] = { ...entries[index], ...patch };
  writeFsRegistry(entries);
}

export function pickNextAudiobookSource(
  sources: AudiobookSourceRegistryEntry[],
  batchNumber: number
): AudiobookSourceRegistryEntry | null {
  const enabled = sources.filter((entry) => entry.is_enabled && !entry.is_exhausted);
  if (enabled.length === 0) return null;
  enabled.sort((left, right) => {
    if (left.accepted_editions !== right.accepted_editions) {
      return left.accepted_editions - right.accepted_editions;
    }
    return left.failure_count - right.failure_count;
  });
  return enabled[batchNumber % enabled.length] ?? enabled[0];
}
