import AsyncStorage from "@react-native-async-storage/async-storage";

import { isMatureTvTestChannel, isMatureTvTestChannelId } from "@/data/matureTvTestChannelCatalog";
import { TV_CHANNEL_SEEDS } from "@/data/tvChannelSeedCatalog";
import {
  getTvChannelRuntimeStatus,
  loadTvChannelRuntimeStatus,
  setTvChannelRuntimeStatus,
} from "@/services/tv/tvChannelRuntimeStatus";
import { isTvPlayerOpen, isTvTabFocused } from "@/services/tv/tvPlaybackActivity";
import type { TVChannel, TvChannelCatalogStatus } from "@/types/tv";

const TV_CHANNEL_VERIFY_LAST_RUN_KEY = "hidden_tunes_tv_channel_verify_last_run_v1";
const VERIFY_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const VERIFY_BATCH_SIZE = 4;
const VERIFY_PROBE_TIMEOUT_MS = 10000;

let verificationInFlight = false;

export async function probeTvStreamUrl(streamUrl: string) {
  const url = streamUrl?.trim();
  if (!url) return false;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), VERIFY_PROBE_TIMEOUT_MS);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/vnd.apple.mpegurl, application/x-mpegURL, */*",
        Range: "bytes=0-511",
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok && response.status !== 206) return false;

    const reader = response.body?.getReader?.();
    if (reader) {
      const { value, done } = await reader.read();
      await reader.cancel().catch(() => undefined);

      if (!value || done) {
        return response.ok;
      }

      const head = new TextDecoder().decode(value.slice(0, 512));
      return head.includes("#EXTM3U") || /\.m3u8/i.test(head);
    }

    const body = await response.text();
    const head = body.slice(0, 512);
    return head.includes("#EXTM3U") || /\.m3u8/i.test(head);
  } catch {
    return false;
  }
}

async function getLastVerificationRunAt() {
  try {
    const raw = await AsyncStorage.getItem(TV_CHANNEL_VERIFY_LAST_RUN_KEY);
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

async function setLastVerificationRunAt(timestamp: number) {
  try {
    await AsyncStorage.setItem(TV_CHANNEL_VERIFY_LAST_RUN_KEY, String(timestamp));
  } catch {}
}

function shouldRetryChannel(channel: TVChannel) {
  if (isMatureTvTestChannel(channel)) return false;
  if (channel.catalogStatus === "removed") return false;

  const runtime = getTvChannelRuntimeStatus(channel.id);
  const effectiveStatus = runtime?.status ?? channel.catalogStatus;

  return effectiveStatus === "temporarily_unavailable";
}

async function verifyChannel(channel: TVChannel) {
  if (channel.catalogStatus === "removed" || isMatureTvTestChannel(channel)) {
    return false;
  }

  const playable = await probeTvStreamUrl(channel.streamUrl);
  const nextStatus: TvChannelCatalogStatus = playable
    ? "active"
    : "temporarily_unavailable";

  const runtime = getTvChannelRuntimeStatus(channel.id);
  const effectiveStatus = runtime?.status ?? channel.catalogStatus;

  if (effectiveStatus === nextStatus) {
    return false;
  }

  await setTvChannelRuntimeStatus(
    channel.id,
    nextStatus,
    playable ? "verification_passed" : "verification_failed"
  );

  return true;
}

export async function runTvChannelVerificationIfDue(options: { force?: boolean } = {}) {
  if (verificationInFlight) return false;
  if (isTvPlayerOpen()) return false;
  if (!options.force && !isTvTabFocused()) return false;

  const lastRunAt = await getLastVerificationRunAt();
  if (!options.force && Date.now() - lastRunAt < VERIFY_COOLDOWN_MS) {
    return false;
  }

  verificationInFlight = true;

  try {
    await loadTvChannelRuntimeStatus();

    if (isTvPlayerOpen()) return false;

    const retryPool = TV_CHANNEL_SEEDS.filter(shouldRetryChannel).slice(
      0,
      VERIFY_BATCH_SIZE
    );

    if (!retryPool.length) {
      await setLastVerificationRunAt(Date.now());
      return false;
    }

    let changed = false;

    for (const channel of retryPool) {
      if (isTvPlayerOpen()) break;

      const updated = await verifyChannel(channel);
      if (updated) changed = true;
    }

    await setLastVerificationRunAt(Date.now());
    return changed;
  } finally {
    verificationInFlight = false;
  }
}

export async function markTvChannelTemporarilyUnavailable(
  channelId: string,
  reason = "playback_failed"
) {
  if (!channelId || isMatureTvTestChannelId(channelId)) return;

  const runtime = getTvChannelRuntimeStatus(channelId);
  if (runtime?.status === "temporarily_unavailable" && runtime.reason === reason) {
    return;
  }

  await loadTvChannelRuntimeStatus();
  await setTvChannelRuntimeStatus(channelId, "temporarily_unavailable", reason);
}
