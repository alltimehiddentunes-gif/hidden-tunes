export function isAbortError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const name = String((error as { name?: string }).name || "");
  return name === "AbortError";
}

let activeResolutionAbortController: AbortController | null = null;
let activeMetadataAbortController: AbortController | null = null;

export function cancelTvMetadataPrefetch() {
  activeMetadataAbortController?.abort();
  activeMetadataAbortController = null;
}

export function cancelTvDiscoveryResolution() {
  cancelTvMetadataPrefetch();
  activeResolutionAbortController?.abort();
  activeResolutionAbortController = null;
}

export function beginTvResolutionRequest() {
  cancelTvMetadataPrefetch();
  activeResolutionAbortController?.abort();
  activeResolutionAbortController = new AbortController();
  return activeResolutionAbortController.signal;
}

export function beginTvMetadataPrefetch() {
  if (activeMetadataAbortController) {
    return null;
  }

  activeMetadataAbortController = new AbortController();
  return activeMetadataAbortController.signal;
}

export function finishTvMetadataPrefetch(signal: AbortSignal) {
  if (activeMetadataAbortController?.signal === signal) {
    activeMetadataAbortController = null;
  }
}

export function isRequestAborted(signal?: AbortSignal) {
  return Boolean(signal?.aborted);
}
