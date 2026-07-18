/**
 * Resolve YouTube channel IDs via public page HTML (no API key).
 * Prints JSON map; does not invent IDs.
 */
import fs from "fs";
import path from "path";
import { getCuratedConcertSources } from "../lib/concerts/sourceRegistry";
import { getKnownConcertYouTubeChannelId } from "../lib/concerts/providers/channelIdentityMap";
import { isValidYouTubeChannelId } from "../lib/concerts/providers/youtubeOfficial";
import { resolveYouTubeChannelIdFromPage } from "../lib/concerts/providers/youtubeRss";

async function main() {
  const sources = getCuratedConcertSources().filter(
    (s) => s.provider === "youtube" && s.importEnabled
  );
  const map: Record<string, string> = {};
  const rows: Array<Record<string, unknown>> = [];

  for (const s of sources) {
    const known =
      (s.providerChannelId && isValidYouTubeChannelId(s.providerChannelId)
        ? s.providerChannelId
        : null) || getKnownConcertYouTubeChannelId(s.stableKey);
    if (known) {
      map[s.stableKey] = known;
      rows.push({ stableKey: s.stableKey, status: "already", channelId: known });
      continue;
    }
    const handle = (s.mediaChannelUrl.match(/@([^/?#]+)/) || [])[1];
    const url = handle
      ? `https://www.youtube.com/@${handle}`
      : s.mediaChannelUrl;
    try {
      const id = await resolveYouTubeChannelIdFromPage(url);
      rows.push({
        stableKey: s.stableKey,
        status: id ? "resolved" : "not_found",
        channelId: id,
        url,
      });
      if (id) map[s.stableKey] = id;
    } catch (error) {
      rows.push({
        stableKey: s.stableKey,
        status: "error",
        channelId: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const report = {
    resolved_or_known: Object.keys(map).length,
    map,
    rows,
  };
  console.log(JSON.stringify(report, null, 2));
  const out = path.join(process.cwd(), "data", "concerts-channel-resolve-map.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
