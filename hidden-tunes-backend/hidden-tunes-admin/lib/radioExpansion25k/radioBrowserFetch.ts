import type { RadioBrowserStation } from "@/lib/radioNormalization";

import { RADIO_BROWSER_SERVERS } from "@/lib/radioExpansion25k/sourceQueries";

export async function fetchRadioBrowserJson(
  path: string,
  options: {
    timeoutMs: number;
    userAgent: string;
    maxRetries?: number;
  }
) {
  const maxRetries = options.maxRetries ?? 5;
  let lastError: unknown = null;

  for (const server of RADIO_BROWSER_SERVERS) {
    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
      try {
        const response = await fetch(`${server}${path}`, {
          headers: {
            "User-Agent": options.userAgent,
            Accept: "application/json",
          },
          signal: controller.signal,
        });
        if (!response.ok) {
          lastError = new Error(`radio_browser_${response.status}`);
          continue;
        }
        const text = await response.text();
        if (!text.trim().startsWith("[")) {
          lastError = new Error("radio_browser_invalid_json");
          continue;
        }
        return {
          server,
          stations: JSON.parse(text) as RadioBrowserStation[],
        };
      } catch (error) {
        lastError = error;
      } finally {
        clearTimeout(timeout);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("radio_browser_failed");
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isMatureRadioCandidate(input: {
  name: string;
  tags: string[];
  category_slug: string;
}) {
  const text = [input.name, input.tags.join(" "), input.category_slug].join(" ").toLowerCase();
  if (/adult contemporary|adult hits|adult pop/.test(text)) return false;
  return /\b(erotic|sex|xxx|porn|adult entertainment|explicit talk)\b/.test(text);
}

export function distribution<T>(
  items: T[],
  selector: (item: T) => string | null | undefined
) {
  const result: Record<string, number> = {};
  for (const item of items) {
    const key = selector(item) || "unknown";
    result[key] = (result[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(result).sort(([, a], [, b]) => b - a));
}
