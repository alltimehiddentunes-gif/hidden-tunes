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
};

export const AUDIOBOOK_ROTATION_SOURCE_KEYS = [
  "librivox",
  "internet_archive:librivoxaudio",
  "internet_archive:opensource_audio",
  "internet_archive:audio_bookspoetry",
] as const;

export type AudiobookRotationSourceKey = (typeof AUDIOBOOK_ROTATION_SOURCE_KEYS)[number];

export async function listEnabledAudiobookSources() {
  const { data, error } = await supabaseAdmin
    .from("audiobook_source_registry")
    .select(
      "id, source_key, source_name, source_type, base_url, rights_policy, default_license, attribution_requirements, supported_languages, supported_formats, checkpoint_cursor, last_successful_import, last_failed_import, failure_count, accepted_editions, rejected_editions, is_enabled, is_exhausted"
    )
    .eq("is_enabled", true)
    .order("accepted_editions", { ascending: true });

  if (error) throw error;
  return (data || []) as AudiobookSourceRegistryEntry[];
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
  const { error } = await supabaseAdmin
    .from("audiobook_source_registry")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("source_key", sourceKey);

  if (error) throw error;
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
