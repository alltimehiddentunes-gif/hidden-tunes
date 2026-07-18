/**
 * Imperative bridge to the single TV playback owner (TvPlaybackProvider).
 * Lets navigation utils start/stop TV without a second playback engine.
 */

import type { HiddenTunesTvPlayback, HiddenTunesTvVideo } from "../tvCatalogApi";
import type { TVChannel, TvLiveSectionId, TvPresentationMode } from "../../types/tv";

export type TvSessionStartResult =
  | { ok: true }
  | { ok: false; error: string };

export type StartCatalogTvSessionInput = {
  video: HiddenTunesTvVideo;
  queue?: HiddenTunesTvVideo[];
  playback?: HiddenTunesTvPlayback | null;
  presentation?: TvPresentationMode;
};

export type StartSeedTvSessionInput = {
  channel: TVChannel;
  sectionId: TvLiveSectionId;
  channelIds: string[];
  presentation?: TvPresentationMode;
};

export type StartResolvedTvSessionInput = {
  item: HiddenTunesTvVideo;
  playback: HiddenTunesTvPlayback;
  queue?: HiddenTunesTvVideo[];
  presentation?: TvPresentationMode;
  seedChannel?: TVChannel | null;
  sectionId?: TvLiveSectionId | null;
  seedQueueIds?: string[];
};

export type TvSessionControllerApi = {
  startCatalogSession: (
    input: StartCatalogTvSessionInput
  ) => Promise<TvSessionStartResult>;
  startSeedSession: (
    input: StartSeedTvSessionInput
  ) => Promise<TvSessionStartResult>;
  startResolvedSession: (
    input: StartResolvedTvSessionInput
  ) => Promise<TvSessionStartResult>;
  stopSession: () => void;
  setPresentationMode: (mode: TvPresentationMode) => void;
  isSessionActive: () => boolean;
  getActiveItemId: () => string | null;
};

let api: TvSessionControllerApi | null = null;

export function registerTvSessionController(next: TvSessionControllerApi | null) {
  api = next;
}

export function getTvSessionController() {
  return api;
}

export function stopTvSession() {
  api?.stopSession();
}

export function setTvPresentationMode(mode: TvPresentationMode) {
  api?.setPresentationMode(mode);
}

export function isTvSessionActive() {
  return api?.isSessionActive() === true;
}
