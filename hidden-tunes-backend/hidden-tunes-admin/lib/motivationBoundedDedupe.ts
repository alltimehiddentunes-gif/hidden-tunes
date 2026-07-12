import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  hashMotivationTitle,
  normalizeMotivationTitleKey,
} from "@/lib/motivationMetadataNormalize";
import type { MotivationGrowthCandidate } from "@/lib/motivationHealth";

export type MotivationDedupeKeySet = {
  sourceKeys: Set<string>;
  urlKeys: Set<string>;
  titleRegionKeys: Set<string>;
  titleSpeakerKeys: Set<string>;
  titleHashKeys: Set<string>;
};

function normalizeUrlKey(value: string | null | undefined) {
  return String(value || "").trim().replace(/\/+$/, "").toLowerCase();
}

function normalizeTitleRegionKey(title: string | null | undefined, region?: string | null) {
  return `${normalizeMotivationTitleKey(title) || ""}::${String(region || "").trim().toLowerCase()}`;
}

function normalizeTitleSpeakerKey(
  title: string | null | undefined,
  speaker?: string | null,
  creator?: string | null
) {
  const speakerKey = normalizeMotivationTitleKey(speaker || creator || "") || "";
  return `${normalizeMotivationTitleKey(title) || ""}::${speakerKey}`;
}

export function createEmptyMotivationDedupeKeySet(): MotivationDedupeKeySet {
  return {
    sourceKeys: new Set<string>(),
    urlKeys: new Set<string>(),
    titleRegionKeys: new Set<string>(),
    titleSpeakerKeys: new Set<string>(),
    titleHashKeys: new Set<string>(),
  };
}

export function candidateDedupeKeys(candidate: MotivationGrowthCandidate) {
  const sourceKey = candidate.source_key || `${candidate.source_type}:${candidate.source_id}`;
  return {
    sourceKey,
    urlKey: normalizeUrlKey(candidate.source_url),
    titleRegionKey: normalizeTitleRegionKey(candidate.title, candidate.region),
    titleSpeakerKey: normalizeTitleSpeakerKey(
      candidate.title,
      candidate.speaker_name,
      candidate.creator_name || candidate.channel_name
    ),
    titleHashKey: hashMotivationTitle(candidate.title) || "",
  };
}

export function isMotivationCandidateDuplicate(
  candidate: MotivationGrowthCandidate,
  existing: MotivationDedupeKeySet
) {
  const keys = candidateDedupeKeys(candidate);
  return (
    existing.sourceKeys.has(keys.sourceKey) ||
    existing.urlKeys.has(keys.urlKey) ||
    existing.titleRegionKeys.has(keys.titleRegionKey) ||
    (keys.titleSpeakerKey.includes("::") &&
      keys.titleSpeakerKey.split("::")[1] &&
      existing.titleSpeakerKeys.has(keys.titleSpeakerKey)) ||
    (keys.titleHashKey && existing.titleHashKeys.has(keys.titleHashKey))
  );
}

export function registerMotivationCandidateKeys(
  candidate: MotivationGrowthCandidate,
  existing: MotivationDedupeKeySet
) {
  const keys = candidateDedupeKeys(candidate);
  existing.sourceKeys.add(keys.sourceKey);
  existing.urlKeys.add(keys.urlKey);
  existing.titleRegionKeys.add(keys.titleRegionKey);
  existing.titleSpeakerKeys.add(keys.titleSpeakerKey);
  if (keys.titleHashKey) existing.titleHashKeys.add(keys.titleHashKey);
}

export async function loadMotivationDedupeKeysForCandidates(
  candidates: MotivationGrowthCandidate[]
): Promise<MotivationDedupeKeySet> {
  const existing = createEmptyMotivationDedupeKeySet();
  if (candidates.length === 0) return existing;

  const sourceKeys = new Set<string>();
  const urlKeys = new Set<string>();
  const titleRegionKeys = new Set<string>();
  const titleSpeakerKeys = new Set<string>();

  for (const candidate of candidates) {
    const keys = candidateDedupeKeys(candidate);
    sourceKeys.add(keys.sourceKey);
    if (keys.urlKey) urlKeys.add(keys.urlKey);
    titleRegionKeys.add(keys.titleRegionKey);
    titleSpeakerKeys.add(keys.titleSpeakerKey);
  }

  const sourceKeyList = [...sourceKeys];
  const urlKeyList = [...urlKeys];

  const chunkSize = 100;
  for (let offset = 0; offset < sourceKeyList.length; offset += chunkSize) {
    const chunk = sourceKeyList.slice(offset, offset + chunkSize);
    const { data, error } = await supabaseAdmin
      .from("motivation_items")
      .select("id, source_key, source_type, source_id, source_url, title, region, speaker_name, creator_name")
      .in("source_key", chunk);
    if (error) throw new Error(error.message);
    mergeRowsIntoDedupeSet((data || []) as Array<Record<string, unknown>>, existing);
  }

  for (let offset = 0; offset < urlKeyList.length; offset += chunkSize) {
    const chunk = urlKeyList.slice(offset, offset + chunkSize);
    const { data, error } = await supabaseAdmin
      .from("motivation_items")
      .select("id, source_key, source_type, source_id, source_url, title, region, speaker_name, creator_name")
      .in("source_url", chunk);
    if (error) throw new Error(error.message);
    mergeRowsIntoDedupeSet((data || []) as Array<Record<string, unknown>>, existing);
  }

  return existing;
}

function mergeRowsIntoDedupeSet(
  rows: Array<Record<string, unknown>>,
  existing: MotivationDedupeKeySet
) {
  for (const row of rows) {
    const sourceKey = String(
      row.source_key || `${row.source_type || ""}:${row.source_id || ""}`
    );
    existing.sourceKeys.add(sourceKey);
    existing.urlKeys.add(normalizeUrlKey(String(row.source_url || "")));
    existing.titleRegionKeys.add(
      normalizeTitleRegionKey(String(row.title || ""), String(row.region || ""))
    );
    existing.titleSpeakerKeys.add(
      normalizeTitleSpeakerKey(
        String(row.title || ""),
        String(row.speaker_name || ""),
        String(row.creator_name || "")
      )
    );
    const hash = hashMotivationTitle(String(row.title || ""));
    if (hash) existing.titleHashKeys.add(hash);
  }
}

export function dedupeMotivationCandidatesBounded(
  candidates: MotivationGrowthCandidate[],
  existing: MotivationDedupeKeySet
) {
  const accepted: MotivationGrowthCandidate[] = [];

  for (const candidate of candidates) {
    if (isMotivationCandidateDuplicate(candidate, existing)) continue;
    registerMotivationCandidateKeys(candidate, existing);
    accepted.push(candidate);
  }

  return accepted;
}
