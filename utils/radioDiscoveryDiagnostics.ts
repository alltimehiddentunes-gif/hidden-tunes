import { isRadioDiscoveryDiagnosticsEnabled } from "./devDiagnostics";

type RadioDiscoveryFetchEvent = {
  source: string;
  detail?: string;
  at: number;
};

type RadioDiscoveryRenderEvent = {
  surface: string;
  count: number;
  at: number;
};

const MAX_EVENTS = 120;
const fetchEvents: RadioDiscoveryFetchEvent[] = [];
const renderEvents: RadioDiscoveryRenderEvent[] = [];

export function logRadioDiscoveryFetch(source: string, detail?: string) {
  if (!isRadioDiscoveryDiagnosticsEnabled()) return;

  fetchEvents.push({ source, detail, at: Date.now() });
  if (fetchEvents.length > MAX_EVENTS) fetchEvents.shift();
}

export function logRadioDiscoveryRender(surface: string) {
  if (!isRadioDiscoveryDiagnosticsEnabled()) return;

  const last = renderEvents[renderEvents.length - 1];
  if (last?.surface === surface && Date.now() - last.at < 500) {
    last.count += 1;
    last.at = Date.now();
    return;
  }

  renderEvents.push({ surface, count: 1, at: Date.now() });
  if (renderEvents.length > MAX_EVENTS) renderEvents.shift();
}

export function getRadioDiscoveryDiagnosticsReport() {
  const fetchCounts = new Map<string, number>();
  fetchEvents.forEach((event) => {
    const key = event.detail ? `${event.source}:${event.detail}` : event.source;
    fetchCounts.set(key, (fetchCounts.get(key) || 0) + 1);
  });

  const renderBursts = renderEvents
    .filter((event) => event.count > 3)
    .map((event) => ({
      surface: event.surface,
      renders: event.count,
      at: new Date(event.at).toISOString(),
    }));

  return {
    enabled: isRadioDiscoveryDiagnosticsEnabled(),
    totalFetches: fetchEvents.length,
    fetchCounts: Object.fromEntries(fetchCounts.entries()),
    recentFetches: fetchEvents.slice(-12).map((event) => ({
      source: event.source,
      detail: event.detail,
      at: new Date(event.at).toISOString(),
    })),
    renderBursts,
  };
}

export function resetRadioDiscoveryDiagnostics() {
  fetchEvents.length = 0;
  renderEvents.length = 0;
}
