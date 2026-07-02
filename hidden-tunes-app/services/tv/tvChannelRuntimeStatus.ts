import AsyncStorage from "@react-native-async-storage/async-storage";

import type { TvChannelCatalogStatus } from "@/types/tv";

const TV_CHANNEL_RUNTIME_STATUS_KEY = "hidden_tunes_tv_channel_runtime_status_v1";
const RUNTIME_STATUS_PERSIST_DEBOUNCE_MS = 1200;

export type TvChannelRuntimeStatusEntry = {
  status: TvChannelCatalogStatus;
  verifiedAt: string;
  reason?: string;
};

type RuntimeStatusMap = Record<string, TvChannelRuntimeStatusEntry>;

let runtimeStatusById = new Map<string, TvChannelRuntimeStatusEntry>();
let loadPromise: Promise<void> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let persistPending = false;

function normalizeEntry(raw: unknown): TvChannelRuntimeStatusEntry | null {
  if (!raw || typeof raw !== "object") return null;

  const row = raw as Record<string, unknown>;
  const status = String(row.status || "").trim();
  const verifiedAt = String(row.verifiedAt || "").trim();

  if (
    status !== "active" &&
    status !== "temporarily_unavailable" &&
    status !== "removed"
  ) {
    return null;
  }

  if (!verifiedAt) return null;

  return {
    status,
    verifiedAt,
    reason: row.reason ? String(row.reason) : undefined,
  };
}

function schedulePersistRuntimeStatus() {
  if (persistTimer) return;

  persistTimer = setTimeout(() => {
    persistTimer = null;
    void flushRuntimeStatusPersist();
  }, RUNTIME_STATUS_PERSIST_DEBOUNCE_MS);
}

async function flushRuntimeStatusPersist() {
  if (!persistPending) return;

  persistPending = false;

  const payload: RuntimeStatusMap = {};
  for (const [channelId, entry] of runtimeStatusById.entries()) {
    payload[channelId] = entry;
  }

  try {
    await AsyncStorage.setItem(TV_CHANNEL_RUNTIME_STATUS_KEY, JSON.stringify(payload));
  } catch {
    persistPending = true;
    schedulePersistRuntimeStatus();
  }
}

export async function loadTvChannelRuntimeStatus() {
  if (loadPromise) {
    await loadPromise;
    return;
  }

  loadPromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(TV_CHANNEL_RUNTIME_STATUS_KEY);
      runtimeStatusById = new Map();

      if (!raw) return;

      const parsed = JSON.parse(raw) as RuntimeStatusMap;

      for (const [channelId, entry] of Object.entries(parsed)) {
        const normalized = normalizeEntry(entry);
        if (normalized) {
          runtimeStatusById.set(channelId, normalized);
        }
      }
    } catch {
      runtimeStatusById = new Map();
    } finally {
      loadPromise = null;
    }
  })();

  await loadPromise;
}

export function getTvChannelRuntimeStatus(channelId: string) {
  return runtimeStatusById.get(channelId) || null;
}

export function getEffectiveTvChannelCatalogStatus(channel: {
  id: string;
  catalogStatus: TvChannelCatalogStatus;
}): TvChannelCatalogStatus {
  if (channel.catalogStatus === "removed") {
    return "removed";
  }

  const runtime = runtimeStatusById.get(channel.id);
  return runtime?.status ?? channel.catalogStatus;
}

export function isTvChannelCatalogActive(channel: {
  id: string;
  catalogStatus: TvChannelCatalogStatus;
}) {
  return getEffectiveTvChannelCatalogStatus(channel) === "active";
}

export async function setTvChannelRuntimeStatus(
  channelId: string,
  status: TvChannelCatalogStatus,
  reason?: string
) {
  if (!channelId) return;

  const current = runtimeStatusById.get(channelId);
  if (current?.status === status && current.reason === reason) {
    return;
  }

  runtimeStatusById.set(channelId, {
    status,
    verifiedAt: new Date().toISOString(),
    reason,
  });

  persistPending = true;
  schedulePersistRuntimeStatus();
}

export async function clearTvChannelRuntimeStatus(channelId: string) {
  if (!channelId || !runtimeStatusById.has(channelId)) return;

  runtimeStatusById.delete(channelId);
  persistPending = true;
  schedulePersistRuntimeStatus();
}
