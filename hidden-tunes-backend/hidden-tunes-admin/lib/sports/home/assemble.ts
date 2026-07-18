/**
 * Assemble Sports home sections from isolated loader results.
 */

import { logSportsEvent } from "../telemetry";
import {
  SPORTS_HOME_SECTION_RANK,
  SPORTS_HOME_SECTION_TITLES,
  type SportsHomeSection,
  type SportsHomeSectionId,
  type SportsHomeResponse,
} from "./types";

export type SectionLoaderResult = {
  id: SportsHomeSectionId;
  type: SportsHomeSection["type"];
  items: unknown[];
  nextCursor?: string | null;
  subtitle?: string;
};

export function sortHomeSections(
  sections: SportsHomeSection[]
): SportsHomeSection[] {
  return [...sections].sort((a, b) => a.rank - b.rank);
}

export function omitEmptyHomeContractSections(
  sections: SportsHomeSection[]
): SportsHomeSection[] {
  return sections.filter((s) => Array.isArray(s.items) && s.items.length > 0);
}

export function buildSectionFromLoader(
  result: SectionLoaderResult
): SportsHomeSection | null {
  if (!result.items.length) return null;
  const base = {
    id: result.id,
    type: result.type,
    title: SPORTS_HOME_SECTION_TITLES[result.id],
    subtitle: result.subtitle,
    rank: SPORTS_HOME_SECTION_RANK[result.id],
    items: result.items,
    nextCursor: result.nextCursor ?? null,
  };
  return base as SportsHomeSection;
}

export function assembleSportsHomeFromSettled(input: {
  generatedAt?: string;
  settled: PromiseSettledResult<SectionLoaderResult>[];
  labels: SportsHomeSectionId[];
}): {
  response: SportsHomeResponse;
  sectionErrors: Array<{ section: string; error: string }>;
} {
  const sectionErrors: Array<{ section: string; error: string }> = [];
  const sections: SportsHomeSection[] = [];

  input.settled.forEach((result, index) => {
    const label = input.labels[index] || `section_${index}`;
    if (result.status === "rejected") {
      const error =
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason || "unknown");
      sectionErrors.push({ section: label, error });
      logSportsEvent("home_section_failed", { section: label, error });
      return;
    }
    const built = buildSectionFromLoader(result.value);
    if (built) sections.push(built);
  });

  return {
    response: {
      generatedAt: input.generatedAt || new Date().toISOString(),
      sections: sortHomeSections(omitEmptyHomeContractSections(sections)),
    },
    sectionErrors,
  };
}

/** Encode/decode opaque cursors for stable pagination (offset-based). */
export function encodeSportsCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ o: Math.max(0, offset) }), "utf8").toString(
    "base64url"
  );
}

export function decodeSportsCursor(cursor?: string | null): number {
  if (!cursor) return 0;
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as { o?: unknown };
    const o = Number(parsed.o);
    return Number.isFinite(o) && o >= 0 ? Math.floor(o) : 0;
  } catch {
    return 0;
  }
}
