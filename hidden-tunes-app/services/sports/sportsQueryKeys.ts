/** Stable React Query / SWR keys for Sports. */
export const sportsQueryKeys = {
  all: ["sports"] as const,
  home: (country: string, platform: string) =>
    ["sports", "home", country, platform] as const,
  live: (page: number) => ["sports", "live", page] as const,
  upcoming: (page: number) => ["sports", "upcoming", page] as const,
  search: (q: string, page: number) => ["sports", "search", q, page] as const,
  fixture: (id: string) => ["sports", "fixture", id] as const,
  broadcast: (id: string) => ["sports", "broadcast", id] as const,
  channel: (id: string) => ["sports", "channel", id] as const,
  video: (id: string) => ["sports", "video", id] as const,
  continueWatching: () => ["sports", "continue-watching"] as const,
  history: () => ["sports", "history"] as const,
  favorites: () => ["sports", "favorites"] as const,
};
