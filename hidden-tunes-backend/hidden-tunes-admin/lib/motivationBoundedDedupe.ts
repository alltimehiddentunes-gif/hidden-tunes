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
  const urlChunkSize = 25;

  async function queryWithRetry<T>(runner: () => Promise<T>, attempts = 2): Promise<T> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        return await runner();
      } catch (error) {
        lastError = error;
        const delayMs = Math.min(15_000, 1000 * 2 ** attempt);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  async function queryChunkWithFallback(
    column: "source_key" | "source_url",
    chunk: string[]
  ) {
    try {
      const { data, error } = await queryWithRetry(async () =>
        supabaseAdmin
          .from("motivation_items")
          .select("id, source_key, source_type, source_id, source_url, title, region, speaker_name, creator_name")
          .in(column, chunk)
      );
      if (error) throw new Error(error.message);
      mergeRowsIntoDedupeSet((data || []) as Array<Record<string, unknown>>, existing);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        JSON.stringify({
          motivation_dedupe_lookup: true,
          status: "degraded",
          column,
          chunk_size: chunk.length,
          error: message,
        })
      );
    }
  }

  for (let offset = 0; offset < sourceKeyList.length; offset += chunkSize) {
    const chunk = sourceKeyList.slice(offset, offset + chunkSize);
    await queryChunkWithFallback("source_key", chunk);
  }

  for (let offset = 0; offset < urlKeyList.length; offset += urlChunkSize) {
    const chunk = urlKeyList.slice(offset, offset + urlChunkSize);
    await queryChunkWithFallback("source_url", chunk);
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
