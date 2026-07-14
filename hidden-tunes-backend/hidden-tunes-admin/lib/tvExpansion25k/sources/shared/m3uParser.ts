export type ParsedM3uEntry = {
  title: string;
  url: string;
  tvgId?: string | null;
  tvgName?: string | null;
  tvgCountry?: string | null;
  tvgLanguage?: string | null;
  groupTitle?: string | null;
  logo?: string | null;
};

function parseExtInf(line: string) {
  const attrs: Record<string, string> = {};
  for (const match of line.matchAll(/([a-zA-Z0-9\-_]+)="([^"]*)"/g)) {
    attrs[match[1]] = match[2];
  }

  const titleMatch = line.match(/,(.+)$/);
  return {
    attrs,
    title: titleMatch?.[1]?.trim() || attrs["tvg-name"] || "Unknown",
  };
}

export function parseM3uPlaylist(source: string): ParsedM3uEntry[] {
  const lines = source.split(/\r?\n/);
  const entries: ParsedM3uEntry[] = [];
  let pending: ParsedM3uEntry | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("#EXTINF")) {
      const { attrs, title } = parseExtInf(line);
      pending = {
        title,
        url: "",
        tvgId: attrs["tvg-id"] || null,
        tvgName: attrs["tvg-name"] || null,
        tvgCountry: attrs["tvg-country"] || null,
        tvgLanguage: attrs["tvg-language"] || null,
        groupTitle: attrs["group-title"] || null,
        logo: attrs["tvg-logo"] || null,
      };
      continue;
    }

    if (line.startsWith("#")) continue;

    if (pending) {
      pending.url = line;
      entries.push(pending);
      pending = null;
    }
  }

  return entries;
}

export function sliceM3uEntries(entries: ParsedM3uEntry[], offset: number, limit: number) {
  return {
    slice: entries.slice(offset, offset + limit),
    nextOffset: offset + limit >= entries.length ? entries.length : offset + limit,
    exhausted: offset + limit >= entries.length,
    total: entries.length,
  };
}
