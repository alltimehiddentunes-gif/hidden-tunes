import type { WorldwideRadioCountry } from "@/lib/radioWorldwideExpansion/types";
import {
  isRejectedDeepUrl,
  type DeepSourceSeed,
} from "@/lib/radioWorldwideExpansion/deepSources/buildCuratedCandidate";

const UA = "Mozilla/5.0 HiddenTunesRadio/1.0";

function extractStreams(html: string): string[] {
  const pattern =
    /https?:\/\/[^\s"'<>\\]+(?:stream\.zeno\.fm|stream\.radiojar\.com|listen\.radioking\.com|ice\.infomaniak\.ch|streams\.radio\.co|svrdedicado\.org|myradiostream\.com|justweb\.pt|ndx\.co\.za|paineldj|servidoresbrasil|stm\d+\.srvif\.com|bbcmedia\.co\.uk|icecast|radio\.co|\/stream|\/listen)[^\s"'<>\\]*/gi;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(pattern)) {
    const url = m[0].replace(/[),;]+$/, "");
    if (isRejectedDeepUrl(url)) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(url);
  }
  return out;
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html,*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(18_000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function searchRadioGarden(query: string) {
  const url = `https://radio.garden/api/search?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    return [] as Array<{
      code?: string;
      type?: string;
      page?: {
        url?: string;
        title?: string;
        website?: string;
        stream?: string;
      };
    }>;
  }
  const json = (await res.json()) as {
    hits?: { hits?: Array<{ _source?: Record<string, unknown> }> };
  };
  return (json.hits?.hits || []).map((h) => h._source || {}) as Array<{
    code?: string;
    type?: string;
    page?: {
      url?: string;
      title?: string;
      website?: string;
      stream?: string;
    };
  }>;
}

/**
 * Radio Garden is used only to discover broadcaster websites, then scrape
 * published stream URLs from those sites (broadcaster_published_playlists policy).
 */
export async function discoverRadioGardenSeeds(
  country: WorldwideRadioCountry,
  options?: { cityLimit?: number; delayMs?: number }
): Promise<DeepSourceSeed[]> {
  const cityLimit = options?.cityLimit ?? 6;
  const delayMs = options?.delayMs ?? 150;
  const seeds: DeepSourceSeed[] = [];
  const channelKeys = new Set<string>();
  const siteCache = new Map<string, string[]>();
  const queries = [country.name, ...(country.cities || []).slice(0, cityLimit)];

  for (const q of queries) {
    let hits: Awaited<ReturnType<typeof searchRadioGarden>> = [];
    try {
      hits = await searchRadioGarden(q);
    } catch {
      continue;
    }
    for (const hit of hits) {
      if (hit.type !== "channel" || !hit.page?.url || !hit.page.title) continue;
      const channelId = hit.page.url.split("/").pop();
      if (!channelId) continue;
      const key = `${country.code}|${channelId}`;
      if (channelKeys.has(key)) continue;
      if (hit.code && hit.code !== country.code) continue;
      channelKeys.add(key);

      if (hit.page.stream && /^https?:\/\//i.test(hit.page.stream) && !isRejectedDeepUrl(hit.page.stream)) {
        seeds.push({
          code: country.code,
          name: hit.page.title,
          url: hit.page.stream,
          attribution: "rg-stream",
          source_family: "radio_garden_site",
        });
      }

      const website = hit.page.website?.trim();
      if (!website || /facebook\.com|twitter\.com|x\.com|instagram\.com/i.test(website)) continue;
      let found = siteCache.get(website);
      if (!found) {
        const html = await fetchText(website);
        found = html ? extractStreams(html) : [];
        siteCache.set(website, found);
      }
      for (const streamUrl of found) {
        seeds.push({
          code: country.code,
          name: hit.page.title,
          url: streamUrl,
          attribution: `rg-site:${website}`,
          source_family: "radio_garden_site",
        });
      }
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }

  const seen = new Set<string>();
  return seeds.filter((s) => {
    const key = `${s.code}|${s.url.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
