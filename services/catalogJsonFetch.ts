/**
 * Shared catalog GET helper for admin.hiddentunes.com media sections.
 * Adds a hard timeout so hung backend routes cannot leave UI spinners forever,
 * and refuses to treat HTML/gateway bodies as JSON.
 */

export const CATALOG_REQUEST_TIMEOUT_MS = 15_000;

export function isCatalogAbortError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return (
    error.name === "AbortError" ||
    error.message === "Aborted" ||
    error.message === "radio_catalog_attach_aborted"
  );
}

export function isCatalogTimeoutError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.message === "catalog_api_timeout")
  );
}

function abortError() {
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}

function timeoutError() {
  const error = new Error("catalog_api_timeout");
  error.name = "TimeoutError";
  return error;
}

export type CatalogJsonFetchResult = {
  response: Response;
  json: unknown;
  contentType: string;
};

/**
 * GET JSON with Accept: application/json, optional parent AbortSignal, and timeout.
 * Parent cancellation surfaces as AbortError; timeout surfaces as TimeoutError.
 */
export async function catalogJsonFetch(
  url: string,
  options?: { signal?: AbortSignal; timeoutMs?: number }
): Promise<CatalogJsonFetchResult> {
  const timeoutMs = Math.max(1_000, Number(options?.timeoutMs || CATALOG_REQUEST_TIMEOUT_MS));
  const parent = options?.signal;
  const controller = new AbortController();
  let timedOut = false;

  if (parent?.aborted) {
    throw abortError();
  }

  const onParentAbort = () => controller.abort();
  parent?.addEventListener("abort", onParentAbort);

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });

    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    const trimmed = text.trim();
    const looksHtml = /^<!doctype html|<html[\s>]/i.test(trimmed);
    const claimsJson = contentType.toLowerCase().includes("application/json");

    if (looksHtml || (!claimsJson && !trimmed)) {
      throw new Error(
        response.ok ? "catalog_api_non_json_response" : `catalog_api_${response.status}`
      );
    }

    let json: unknown = null;
    if (trimmed) {
      try {
        json = JSON.parse(trimmed);
      } catch {
        throw new Error("catalog_api_invalid_json");
      }
    }

    return { response, json, contentType };
  } catch (error) {
    if (timedOut) {
      throw timeoutError();
    }
    if (parent?.aborted || isCatalogAbortError(error)) {
      throw abortError();
    }
    throw error;
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener("abort", onParentAbort);
  }
}
