import type { RefObject } from "react";
import type WebView from "react-native-webview";

import { clearTvDiscoverySession } from "@/services/tvDiscoverySessionStore";
import { cancelTvDiscoveryResolution } from "@/services/tvDiscoveryAbort";

export const TV_PLAYER_STOP_SCRIPT = `(function () {
  var video = document.getElementById("hiddenTunesTvPlayer");
  if (!video) return true;
  try {
    video.pause();
  } catch (e) {}
  try {
    video.removeAttribute("src");
    if (video.querySelector) {
      var sources = video.querySelectorAll("source");
      for (var i = 0; i < sources.length; i += 1) {
        sources[i].removeAttribute("src");
      }
    }
    video.load();
  } catch (e) {}
  return true;
})();`;

export function stopTvWebViewPlayback(webViewRef: RefObject<WebView | null>) {
  const webView = webViewRef.current;
  if (!webView) return;

  try {
    webView.injectJavaScript(TV_PLAYER_STOP_SCRIPT);
  } catch {
    // WebView may already be destroyed.
  }

  try {
    webView.stopLoading();
  } catch {
    // ignore
  }
}

export function releaseTvPlayerRuntime(options?: {
  webViewRef?: RefObject<WebView | null>;
  clearSession?: boolean;
}) {
  cancelTvDiscoveryResolution();

  if (options?.webViewRef) {
    stopTvWebViewPlayback(options.webViewRef);
  }

  if (options?.clearSession !== false) {
    clearTvDiscoverySession();
  }
}

export function isAbortError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const name = String((error as { name?: string }).name || "");
  return name === "AbortError";
}
