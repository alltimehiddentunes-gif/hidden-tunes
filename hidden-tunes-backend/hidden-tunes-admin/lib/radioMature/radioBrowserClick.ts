const RADIO_BROWSER_SERVERS = [
  "https://de1.api.radio-browser.info",
  "https://nl1.api.radio-browser.info",
  "https://at1.api.radio-browser.info",
] as const;

const RADIO_BROWSER_CLICK_UA =
  "HiddenTunesRadioRelay/1.0 (+https://admin.hiddentunes.com; catalog click)";

export async function recordRadioBrowserStationClick(input: {
  stationUuid: string;
  sourceServer?: string | null;
}) {
  const uuid = String(input.stationUuid || "").trim();
  if (!uuid) return { ok: false as const, reason: "missing_station_uuid" };

  const servers = input.sourceServer
    ? [input.sourceServer, ...RADIO_BROWSER_SERVERS.filter((server) => server !== input.sourceServer)]
    : [...RADIO_BROWSER_SERVERS];

  for (const server of servers) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`${server}/json/url/${encodeURIComponent(uuid)}`, {
        method: "GET",
        headers: {
          "User-Agent": RADIO_BROWSER_CLICK_UA,
          Accept: "application/json",
        },
        signal: controller.signal,
      });
      if (response.ok) {
        return { ok: true as const, server };
      }
    } catch {
      // try next mirror
    } finally {
      clearTimeout(timeout);
    }
  }

  return { ok: false as const, reason: "click_failed" };
}
