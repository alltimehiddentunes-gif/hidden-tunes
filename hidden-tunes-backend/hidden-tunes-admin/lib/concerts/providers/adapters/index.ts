import type { ConcertMediaProviderId } from "../../candidate";
import { detectProviderFromUrl, type ConcertProviderAdapter } from "../adapter";
import { youtubeConcertAdapter } from "./youtube";
import { vimeoConcertAdapter } from "./vimeo";
import { dailymotionConcertAdapter } from "./dailymotion";
import { twitchConcertAdapter } from "./twitch";
import {
  dashConcertAdapter,
  hlsConcertAdapter,
  iframeConcertAdapter,
} from "./stream";

const ADAPTERS: ConcertProviderAdapter[] = [
  youtubeConcertAdapter,
  vimeoConcertAdapter,
  dailymotionConcertAdapter,
  twitchConcertAdapter,
  hlsConcertAdapter,
  dashConcertAdapter,
  iframeConcertAdapter,
];

const BY_ID = new Map(ADAPTERS.map((a) => [a.id, a]));

export function listConcertProviderAdapters(): ConcertProviderAdapter[] {
  return [...ADAPTERS];
}

export function getConcertProviderAdapter(
  id: ConcertMediaProviderId
): ConcertProviderAdapter | null {
  return BY_ID.get(id) || null;
}

export function resolveConcertProviderAdapter(
  urlOrId: string,
  preferred?: ConcertMediaProviderId | null
): ConcertProviderAdapter | null {
  if (preferred) {
    const preferredAdapter = BY_ID.get(preferred);
    if (preferredAdapter?.detect(urlOrId) || preferredAdapter) {
      return preferredAdapter;
    }
  }
  const detected = detectProviderFromUrl(urlOrId);
  if (detected) return BY_ID.get(detected) || null;
  for (const adapter of ADAPTERS) {
    if (adapter.detect(urlOrId)) return adapter;
  }
  return null;
}
