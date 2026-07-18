import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  type ComponentType,
  type Ref,
} from "react";
import { View } from "react-native";
import { isExpoVideoNativeAvailable } from "../../services/tv/expoVideoAvailability";

export type TvNativeVideoHandle = {
  play: () => void;
  pause: () => void;
  unload: () => void;
};

type TvNativeVideoSurfaceProps = {
  streamUrl: string;
  onPlaying: () => void;
  onPaused: () => void;
  onError: () => void;
};

type ImplComponent = ComponentType<
  TvNativeVideoSurfaceProps & { ref?: Ref<TvNativeVideoHandle> }
>;

/**
 * Safe entry for the native TV surface.
 * Never import expo-video at module scope — that crashes binaries without ExpoVideo.
 * Surface selection already forces WebView when native is missing; this is defense-in-depth.
 */
let Impl: ImplComponent | null | undefined;

function getImpl(): ImplComponent | null {
  if (Impl !== undefined) return Impl;
  if (!isExpoVideoNativeAvailable()) {
    Impl = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Impl = require("./TvNativeVideoSurfaceImpl").default;
  } catch {
    Impl = null;
  }
  return Impl;
}

const UnavailableNativeSurface = forwardRef<
  TvNativeVideoHandle,
  { onError: () => void }
>(function UnavailableNativeSurface({ onError }, ref) {
  useImperativeHandle(
    ref,
    () => ({
      play: () => {},
      pause: () => {},
      unload: () => {},
    }),
    []
  );

  useEffect(() => {
    onError();
  }, [onError]);

  return <View />;
});

const TvNativeVideoSurface = forwardRef<
  TvNativeVideoHandle,
  TvNativeVideoSurfaceProps
>(function TvNativeVideoSurface(props, ref) {
  const Component = getImpl();
  if (!Component) {
    return <UnavailableNativeSurface ref={ref} onError={props.onError} />;
  }
  return <Component {...props} ref={ref} />;
});

export default TvNativeVideoSurface;
