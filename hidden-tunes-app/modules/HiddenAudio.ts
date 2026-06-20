import { NativeModules } from "react-native";

export type HiddenAudioStatus = {
  position: number;
  duration: number;
  isPlaying: boolean;
};

type HiddenAudioNativeModule = {
  load(url: string): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  getStatus(): Promise<HiddenAudioStatus>;
};

const nativeModule = NativeModules.HiddenAudio as
  | HiddenAudioNativeModule
  | undefined;

function requireNativeModule(): HiddenAudioNativeModule {
  if (
    !nativeModule ||
    typeof nativeModule.load !== "function" ||
    typeof nativeModule.getStatus !== "function"
  ) {
    throw new Error(
      "HiddenAudio native module is not available. Use a dev client or preview build with HiddenAudio linked."
    );
  }

  return nativeModule;
}

const HiddenAudio: HiddenAudioNativeModule = {
  load(url: string) {
    return requireNativeModule().load(url);
  },
  play() {
    return requireNativeModule().play();
  },
  pause() {
    return requireNativeModule().pause();
  },
  seek(positionMs: number) {
    return requireNativeModule().seek(positionMs);
  },
  getStatus() {
    return requireNativeModule().getStatus();
  },
};

export default HiddenAudio;
