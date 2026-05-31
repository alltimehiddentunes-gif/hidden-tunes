import type { QueryContext } from "../types/music";
import { getWorldPreset, isWorldPresetId } from "../utils/emotionalWorlds";
import type { ParsedSearchQuery } from "./searchQueryParser";

function mergeMoodTags(...groups: string[][]) {
  return Array.from(
    new Set(
      groups
        .flat()
        .map((tag) => String(tag || "").trim())
        .filter(Boolean)
    )
  );
}

function resolveWorldPresetId(worldTokens: string[]) {
  return worldTokens.find((worldId) => isWorldPresetId(worldId)) ?? null;
}

export function buildSearchContext(parsed: ParsedSearchQuery): QueryContext {
  const text = parsed.normalizedText.trim();
  const moodTags = parsed.emotionalTokens.filter(Boolean);
  const presetWorldId = resolveWorldPresetId(parsed.worldTokens);
  const legacyWorld = parsed.worldTokens.find(
    (worldId) => !isWorldPresetId(worldId)
  );

  const ctx: QueryContext = {};

  if (text) {
    ctx.text = text;
  }

  if (presetWorldId) {
    const preset = getWorldPreset(presetWorldId);
    if (preset) {
      ctx.world = preset.world;
      const mergedMoodTags = mergeMoodTags(moodTags, preset.moodTags);
      if (mergedMoodTags.length) {
        ctx.moodTags = mergedMoodTags;
      }
      return ctx;
    }
  }

  if (moodTags.length) {
    ctx.moodTags = moodTags;
  }

  if (legacyWorld) {
    ctx.world = legacyWorld;
  }

  return ctx;
}
