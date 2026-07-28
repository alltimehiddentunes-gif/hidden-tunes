import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(adminRoot, "lib/tvExpansion25k/sources/data");

async function main() {
  const catalog = await fetch("https://www.tdtchannels.com/lists/tv.json").then((response) =>
    response.json()
  );
  const ytPath = path.join(dataDir, "youtubeOfficialGlobal.json");
  const hlsPath = path.join(dataDir, "officialGlobalHls.json");
  const yt = JSON.parse(fs.readFileSync(ytPath, "utf8")) as Array<Record<string, unknown> & { id: string }>;
  const hls = JSON.parse(fs.readFileSync(hlsPath, "utf8")) as Array<Record<string, unknown> & { url: string }>;
  const sql = fs.readFileSync(path.join(adminRoot, "supabase/seeds/tv_starter_catalog.sql"), "utf8");

  const seenYt = new Set(yt.map((row) => row.id));
  for (const segment of sql.split("'youtube_video',").slice(1)) {
    const idMatch = segment.match(/^'([^']+)'/);
    if (!idMatch) continue;
    const id = idMatch[1];
    if (seenYt.has(id)) continue;
    seenYt.add(id);
    const fields = [...segment.matchAll(/'((?:\\'|[^'])*)'/g)].map((match) =>
      match[1].replace(/\\'/g, "'")
    );
    yt.push({
      id,
      title: fields[2] || id,
      url: `https://www.youtube.com/watch?v=${id}`,
      country: fields[8] || null,
      category: fields[5] || "General",
      website: fields[1] || `https://www.youtube.com/watch?v=${id}`,
      channelName: fields[3] || fields[2] || id,
    });
  }

  const seenHls = new Set(hls.map((row) => row.url.toLowerCase()));
  for (const country of catalog.countries || []) {
    for (const ambit of country.ambits || []) {
      for (const channel of ambit.channels || []) {
        for (const option of channel.options || []) {
          if (option.format !== "m3u8" || !option.url) continue;
          const url = option.url.toLowerCase();
          if (seenHls.has(url)) continue;
          const host = new URL(option.url).hostname;
          if (/^\d+\./.test(host)) continue;

          const text = `${channel.name || ""} ${channel.web || ""} ${ambit.name || ""}`.toLowerCase();
          const officialish =
            /(rtve|rtp|france24|bloomberg|dw\.|nasa|parliament|congreso|senado|camara|gov|gob|europarl|un\.org|asamblea|vatican|sansad|cpac|c-span|cspan|ministerio|govern|public|official)/i.test(
              `${host}${option.url}${text}`
            );
          if (!officialish) continue;

          seenHls.add(url);
          hls.push({
            id: String(channel.epg_id || channel.name || "channel")
              .replace(/\W+/g, "-")
              .toLowerCase(),
            title: channel.name,
            url: option.url,
            country: country.name?.slice(0, 2)?.toUpperCase() || null,
            category: ambit.name || "General",
            website: channel.web || null,
            channelName: channel.name,
          });
        }
      }
    }
  }

  for (const country of catalog.countries || []) {
    for (const ambit of country.ambits || []) {
      for (const channel of ambit.channels || []) {
        if (!channel.web) continue;
        for (const option of channel.options || []) {
          if (option.format !== "m3u8" || !option.url) continue;
          const url = option.url.toLowerCase();
          if (seenHls.has(url)) continue;
          const host = new URL(option.url).hostname;
          if (/^\d+\./.test(host)) continue;
          if (!option.url.startsWith("https://")) continue;
          seenHls.add(url);
          hls.push({
            id: String(channel.epg_id || channel.name || "channel")
              .replace(/\W+/g, "-")
              .toLowerCase(),
            title: channel.name,
            url: option.url,
            country: country.name?.slice(0, 2)?.toUpperCase() || null,
            category: ambit.name || "General",
            website: channel.web || null,
            channelName: channel.name,
          });
        }
      }
    }
  }

  const govPath = path.join(dataDir, "governmentParliamentHls.json");
  const gov = JSON.parse(fs.readFileSync(govPath, "utf8")) as Array<{ url: string }>;
  const seenGov = new Set(gov.map((row) => row.url.toLowerCase()));
  for (const country of catalog.countries || []) {
    for (const ambit of country.ambits || []) {
      for (const channel of ambit.channels || []) {
        const text = `${channel.name || ""} ${channel.web || ""} ${ambit.name || ""}`.toLowerCase();
        if (
          !/(parliament|congreso|senado|camara|asamblea|gov|gob|ministerio|sansad|cpac|c-span|cspan|europarl|un\.org)/i.test(
            text
          )
        ) {
          continue;
        }
        for (const option of channel.options || []) {
          if (option.format !== "m3u8" || !option.url) continue;
          const url = option.url.toLowerCase();
          if (seenGov.has(url)) continue;
          seenGov.add(url);
          gov.push({
            id: String(channel.epg_id || channel.name || "channel")
              .replace(/\W+/g, "-")
              .toLowerCase(),
            title: channel.name,
            url: option.url,
            country: country.name?.slice(0, 2)?.toUpperCase() || null,
            category: "Parliament",
            website: channel.web || null,
            channelName: channel.name,
          });
        }
      }
    }
  }

  fs.writeFileSync(govPath, `${JSON.stringify(gov, null, 2)}\n`, "utf8");

  fs.writeFileSync(ytPath, `${JSON.stringify(yt, null, 2)}\n`, "utf8");
  fs.writeFileSync(hlsPath, `${JSON.stringify(hls, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify(
      { youtube: yt.length, officialGlobalHls: hls.length, governmentParliamentHls: gov.length },
      null,
      2
    )
  );
}

void main();
