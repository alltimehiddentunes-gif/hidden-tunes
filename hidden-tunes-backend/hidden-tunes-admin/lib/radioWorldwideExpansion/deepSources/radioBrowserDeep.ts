import {
  isCatalogDuplicate,
  type CatalogDedupeIndex,
} from "@/lib/radioExpansion25k/catalogDedupeIndex";
import {
  fetchRadioBrowserJson,
  isMatureRadioCandidate,
  sleep,
} from "@/lib/radioExpansion25k/radioBrowserFetch";
import {
  normalizeRadioBrowserStationForImport,
  type NormalizedRadioStation,
} from "@/lib/radioNormalization";
import type { WorldwideRadioCountry } from "@/lib/radioWorldwideExpansion/types";

/**
 * Extra Radio Browser walk with hidebroken=false to catch stations the
 * primary continent expand may have missed due to ordering/page caps.
 */
export async function discoverRadioBrowserDeep(
  country: WorldwideRadioCountry,
  catalog: CatalogDedupeIndex,
  options?: { maxPages?: number; delayMs?: number; userAgent?: string }
): Promise<NormalizedRadioStation[]> {
  const maxPages = options?.maxPages ?? 20;
  const delayMs = options?.delayMs ?? 750;
  const userAgent = options?.userAgent || "HiddenTunes/1.0 worldwide-deep-rb";
  const fresh: NormalizedRadioStation[] = [];
  let offset = 0;

  for (let page = 0; page < maxPages; page += 1) {
    let stations: Awaited<ReturnType<typeof fetchRadioBrowserJson>>["stations"] = [];
    let server = "";
    try {
      const fetched = await fetchRadioBrowserJson(
        `/json/stations/bycountrycodeexact/${country.code}?hidebroken=false&limit=100&offset=${offset}&order=votes&reverse=true`,
        { timeoutMs: 15_000, userAgent, maxRetries: 3 }
      );
      stations = fetched.stations;
      server = fetched.server;
    } catch {
      break;
    }
    if (!stations.length) break;

    for (const raw of stations) {
      const normalized = normalizeRadioBrowserStationForImport(raw, "global", {
        now: new Date().toISOString(),
        sourceServer: server,
      });
      if (!normalized) continue;
      if (normalized.country_code && normalized.country_code !== country.code) continue;
      if (!normalized.country_code) {
        normalized.country_code = country.code;
        normalized.country = country.name;
      }
      if (
        isMatureRadioCandidate({
          name: normalized.name,
          tags: normalized.tags,
          category_slug: normalized.category_slug,
        })
      ) {
        continue;
      }
      if (isCatalogDuplicate(normalized, catalog)) continue;
      const key = `${normalized.source_name}:${normalized.source_station_id}`;
      catalog.sourceKeys.add(key);
      catalog.streams.add(normalized.normalized_stream_url);
      catalog.fingerprints.add(normalized.station_fingerprint);
      fresh.push(normalized);
    }

    if (stations.length < 100) break;
    offset += 100;
    await sleep(delayMs);
  }

  return fresh;
}
