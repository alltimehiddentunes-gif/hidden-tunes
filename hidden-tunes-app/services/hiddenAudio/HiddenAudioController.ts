import type {
  HiddenAudioControllerApi,
  HiddenAudioEvent,
  HiddenAudioListener,
  HiddenAudioProgress,
  HiddenAudioState,
  HiddenAudioTrack,
  HiddenAudioUnsubscribe,
} from "./hiddenAudioTypes";
import {
  getHiddenAudioModule,
  subscribeHiddenAudioNativeEvents,
} from "./HiddenAudioModule";
import { logPlaybackDiagnostic } from "../playbackDiagnostics";

const NOT_IMPLEMENTED_MESSAGE =
  "HiddenAudio native module not implemented yet";
const LOG_TAG = "[HiddenAudio]";

const idleState: HiddenAudioState = {
  status: "idle",
  activeTrack: null,
  queue: {
    tracks: [],
    activeIndex: -1,
  },
  error: null,
};

const idleProgress: HiddenAudioProgress = {
  positionSeconds: 0,
  durationSeconds: 0,
  bufferedSeconds: 0,
};

class HiddenAudioControllerImpl implements HiddenAudioControllerApi {
  private listeners = new Set<HiddenAudioListener>();
  private nativeUnsubscribe: HiddenAudioUnsubscribe | null = null;

  async setup(): Promise<void> {
    await this.getNativeModule().setup();
  }

  async loadTrack(track: HiddenAudioTrack): Promise<void> {
    logDiagnostic("hidden_audio_js_load_track_start", {
      trackId: track.id,
      hasUrl: Boolean(track.url),
    });
    await this.getNativeModule().loadTrack(track);
  }

  async loadQueue(
    tracks: HiddenAudioTrack[],
    startIndex: number
  ): Promise<void> {
    const track = tracks[startIndex];
    logDiagnostic("hidden_audio_js_load_track_start", {
      trackId: track?.id,
      hasUrl: Boolean(track?.url),
      queueLength: tracks.length,
      startIndex,
    });
    await this.getNativeModule().loadQueue(tracks, startIndex);
  }

  async play(): Promise<void> {
    logDiagnostic("hidden_audio_js_play_start");
    await this.getNativeModule().play();
  }

  async pause(): Promise<void> {
    await this.getNativeModule().pause();
  }

  async resume(): Promise<void> {
    await this.getNativeModule().resume();
  }

  async stop(): Promise<void> {
    await this.getNativeModule().stop();
  }

  async seekTo(seconds: number): Promise<void> {
    await this.getNativeModule().seekTo(seconds);
  }

  async next(): Promise<void> {
    await this.getNativeModule().next();
  }

  async previous(): Promise<void> {
    await this.getNativeModule().previous();
  }

  async getState(): Promise<HiddenAudioState> {
    const nativeModule = getHiddenAudioModule();
    if (nativeModule) {
      return nativeModule.getState();
    }

    return {
      ...idleState,
      queue: {
        ...idleState.queue,
        tracks: [...idleState.queue.tracks],
      },
    };
  }

  async getProgress(): Promise<HiddenAudioProgress> {
    const nativeModule = getHiddenAudioModule();
    if (nativeModule) {
      return nativeModule.getProgress();
    }

    return { ...idleProgress };
  }

  async getActiveTrack(): Promise<HiddenAudioTrack | null> {
    const nativeModule = getHiddenAudioModule();
    if (nativeModule) {
      return nativeModule.getActiveTrack();
    }

    return null;
  }

  subscribe(listener: HiddenAudioListener): HiddenAudioUnsubscribe {
    this.listeners.add(listener);
    this.ensureNativeSubscription();

    return () => {
      this.listeners.delete(listener);
    };
  }

  protected emit(event: HiddenAudioEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch {
        // Audio listeners must never break playback control flow.
      }
    });
  }

  private getNativeModule() {
    const nativeModule = getHiddenAudioModule();
    if (nativeModule) return nativeModule;

    throw new Error(NOT_IMPLEMENTED_MESSAGE);
  }

  private ensureNativeSubscription(): void {
    if (this.nativeUnsubscribe) return;

    this.nativeUnsubscribe = subscribeHiddenAudioNativeEvents((event) => {
      if (event.type === "diagnostic") {
        logDiagnostic(event.eventName, event.data);
      }
      this.emit(event);
    });
  }
}

function logDiagnostic(
  eventName: string,
  data: Record<string, string | number | boolean | null | undefined> = {}
) {
  console.log(`${LOG_TAG} ${eventName}`, data);
  if (eventName === "hidden_audio_native_progress") return;
  void logPlaybackDiagnostic(eventName, data);
}

export const HiddenAudioController = new HiddenAudioControllerImpl();

export { NOT_IMPLEMENTED_MESSAGE as HIDDEN_AUDIO_NOT_IMPLEMENTED_MESSAGE };

export type {
  HiddenAudioControllerApi,
  HiddenAudioEvent,
  HiddenAudioListener,
  HiddenAudioProgress,
  HiddenAudioState,
  HiddenAudioTrack,
  HiddenAudioUnsubscribe,
};
