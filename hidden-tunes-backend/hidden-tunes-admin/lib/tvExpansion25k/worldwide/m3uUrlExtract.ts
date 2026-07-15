import { parseM3uPlaylist } from "@/lib/tvExpansion25k/sources/shared/m3uParser";

export function extractHttpsUrlsFromM3uText(text: string) {
  const urls: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      const uriMatch = line.match(/URI="(https:\/\/[^"]+)"/i);
      if (uriMatch) urls.push(uriMatch[1]);
      continue;
    }
    if (line.startsWith("https://")) urls.push(line);
  }
  return urls;
}

export function parseM3uSources(text: string) {
  const extInf = parseM3uPlaylist(text);
  const rawUrls = extractHttpsUrlsFromM3uText(text);
  const urls = new Set<string>();
  for (const row of extInf) {
    if (row.url.startsWith("https://")) urls.add(row.url);
  }
  for (const url of rawUrls) urls.add(url);
  return { extInf, urls: [...urls] };
}

export function pickCanonicalManifestUrl(urls: string[]) {
  if (urls.length === 0) return null;
  return urls[urls.length - 1];
}
