import AsyncStorage from "@react-native-async-storage/async-storage";

import type { EmotionalFlowSession } from "./emotionalFlowSession";
import { getEmotionalFlowSettings } from "./emotionalFlowSettings";
import { freezeEmotionalIdentitySnapshot } from "../utils/emotionalStateFreeze";

const STORAGE_KEY = "hidden_tunes_emotional_flow_long_term_memory_v1";
const FLOW_STRENGTH_ROLLING_ALPHA = 0.15;
const WORLD_AFFINITY_INCREMENT = 0.05;
const LONG_TERM_BLEND_WEIGHT = 0.32;
const DAILY_DECAY_RATE = 0.02;
const MS_PER_DAY = 86_400_000;

export type EmotionalFlowLongTermMemory = {
  totalSkips: number;
  totalFullPlays: number;
  worldAffinityHistory: Record<string, number>;
  lateNightUsageCount: number;
  flowStrengthHistory: number;
  lastUpdated: number;
};

export type LongTermMemoryUpdateKind = "skip" | "fullPlay";

type StringStorage = {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
};

type StorageReader = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

const DEFAULT_MEMORY: EmotionalFlowLongTermMemory = {
  totalSkips: 0,
  totalFullPlays: 0,
  worldAffinityHistory: {},
  lateNightUsageCount: 0,
  flowStrengthHistory: 0.5,
  lastUpdated: Date.now(),
};

let memory: EmotionalFlowLongTermMemory = freezeEmotionalIdentitySnapshot({
  ...DEFAULT_MEMORY,
});

let hasLoadedMemory = false;
let loadPromise: Promise<EmotionalFlowLongTermMemory> | null = null;
let storageReader: StorageReader | null = null;

function getStorageReader(): StorageReader {
  if (storageReader) {
    return storageReader;
  }

  try {
    const { MMKV } = require("react-native-mmkv") as {
      MMKV: new (config: { id: string }) => StringStorage;
    };
    const mmkv = new MMKV({ id: "hidden-tunes-emotional-flow-memory" });

    storageReader = {
      getItem: async (key) => mmkv.getString(key) ?? null,
      setItem: async (key, value) => {
        mmkv.set(key, value);
      },
    };
  } catch {
    storageReader = {
      getItem: (key) => AsyncStorage.getItem(key),
      setItem: (key, value) => AsyncStorage.setItem(key, value),
    };
  }

  return storageReader;
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function normalizeMemory(
  value: Partial<EmotionalFlowLongTermMemory> | null | undefined
): EmotionalFlowLongTermMemory {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_MEMORY, lastUpdated: Date.now() };
  }

  const worldAffinityHistory: Record<string, number> = {};

  if (
    value.worldAffinityHistory &&
    typeof value.worldAffinityHistory === "object"
  ) {
    Object.entries(value.worldAffinityHistory).forEach(([worldId, score]) => {
      const normalizedWorldId = String(worldId || "").trim();
      if (!normalizedWorldId) {
        return;
      }

      worldAffinityHistory[normalizedWorldId] = clampScore(Number(score));
    });
  }

  return {
    totalSkips:
      typeof value.totalSkips === "number" && value.totalSkips >= 0
        ? value.totalSkips
        : 0,
    totalFullPlays:
      typeof value.totalFullPlays === "number" && value.totalFullPlays >= 0
        ? value.totalFullPlays
        : 0,
    worldAffinityHistory,
    lateNightUsageCount:
      typeof value.lateNightUsageCount === "number" &&
      value.lateNightUsageCount >= 0
        ? value.lateNightUsageCount
        : 0,
    flowStrengthHistory: clamp01(
      typeof value.flowStrengthHistory === "number"
        ? value.flowStrengthHistory
        : DEFAULT_MEMORY.flowStrengthHistory
    ),
    lastUpdated:
      typeof value.lastUpdated === "number" && value.lastUpdated > 0
        ? value.lastUpdated
        : Date.now(),
  };
}

async function persistLongTermMemory() {
  try {
    await getStorageReader().setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // Persistence failures should not block in-memory updates.
  }
}

function commitLongTermMemory(nextMemory: EmotionalFlowLongTermMemory) {
  memory = freezeEmotionalIdentitySnapshot(nextMemory);
  void persistLongTermMemory();
  return memory;
}

export function loadEmotionalFlowLongTermMemory(): Promise<EmotionalFlowLongTermMemory> {
  if (loadPromise) {
    return loadPromise;
  }

  if (hasLoadedMemory) {
    return Promise.resolve(memory);
  }

  loadPromise = (async () => {
    try {
      const raw = await getStorageReader().getItem(STORAGE_KEY);
      commitLongTermMemory(
        raw
          ? normalizeMemory(JSON.parse(raw) as Partial<EmotionalFlowLongTermMemory>)
          : normalizeMemory(null)
      );
    } catch {
      commitLongTermMemory(normalizeMemory(null));
    } finally {
      hasLoadedMemory = true;
    }

    return memory;
  })();

  return loadPromise;
}

export function getEmotionalFlowLongTermMemory(): EmotionalFlowLongTermMemory {
  return memory;
}

export function decayLongTermMemory(now = Date.now()) {
  const elapsedDays = Math.max(0, (now - memory.lastUpdated) / MS_PER_DAY);
  if (elapsedDays <= 0) {
    return memory;
  }

  const decayAmount = elapsedDays * DAILY_DECAY_RATE;
  const nextWorldAffinityHistory: Record<string, number> = {};

  Object.entries(memory.worldAffinityHistory).forEach(([worldId, score]) => {
    const decayedScore = clampScore(score - decayAmount);
    if (decayedScore > 0) {
      nextWorldAffinityHistory[worldId] = decayedScore;
    }
  });

  return commitLongTermMemory({
    ...memory,
    worldAffinityHistory: nextWorldAffinityHistory,
    flowStrengthHistory: clamp01(memory.flowStrengthHistory - decayAmount),
    lastUpdated: now,
  });
}

export function updateLongTermMemoryFromSession(
  session: EmotionalFlowSession,
  kind: LongTermMemoryUpdateKind
) {
  const settings = getEmotionalFlowSettings();
  const now = Date.now();

  if (kind === "skip") {
    memory = {
      ...memory,
      totalSkips: memory.totalSkips + 1,
    };
  } else {
    memory = {
      ...memory,
      totalFullPlays: memory.totalFullPlays + 1,
    };
  }

  memory = {
    ...memory,
    flowStrengthHistory: clamp01(
      memory.flowStrengthHistory * (1 - FLOW_STRENGTH_ROLLING_ALPHA) +
        session.lastFlowStrength * FLOW_STRENGTH_ROLLING_ALPHA
    ),
    lastUpdated: now,
  };

  if (settings.lateNightModeEnabled) {
    memory = {
      ...memory,
      lateNightUsageCount: memory.lateNightUsageCount + 1,
    };
  }

  const activeWorldId =
    settings.activeWorldId || session.lastWorldEntered || null;

  if (activeWorldId) {
    const currentScore = memory.worldAffinityHistory[activeWorldId] ?? 0;
    memory = {
      ...memory,
      worldAffinityHistory: {
        ...memory.worldAffinityHistory,
        [activeWorldId]: clampScore(currentScore + WORLD_AFFINITY_INCREMENT),
      },
    };
  }

  return commitLongTermMemory(memory);
}

export function getLongTermFlowStrengthBaseline(): number {
  return memory.flowStrengthHistory;
}

export function getLongTermWorldAffinityBaseline(worldId: string | null) {
  if (!worldId) {
    return 0;
  }

  return memory.worldAffinityHistory[worldId] ?? 0;
}

export function getLongTermLateNightBaseline() {
  const usageWeight = Math.min(memory.lateNightUsageCount / 40, 1);
  const completionTotal = memory.totalFullPlays + memory.totalSkips;

  const completionBias =
    completionTotal > 0 ? memory.totalFullPlays / completionTotal : 0.5;

  return clamp01(usageWeight * 0.65 + completionBias * 0.15);
}

export function blendWithLongTermBaseline(
  sessionValue: number,
  longTermValue: number
) {
  return clamp01(
    sessionValue * (1 - LONG_TERM_BLEND_WEIGHT) +
      longTermValue * LONG_TERM_BLEND_WEIGHT
  );
}

export { LONG_TERM_BLEND_WEIGHT };

void loadEmotionalFlowLongTermMemory();
