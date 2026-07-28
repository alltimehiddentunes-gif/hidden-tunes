#!/usr/bin/env node
const handles = [
  "KennedyCenter",
  "TheKennedyCenter",
  "kennedycenter",
  "libraryofcongress",
  "LibraryOfCongress",
  "LibraryofCongress",
  "loc",
  "DutchNationalOpera",
  "NationaleOperaBallet",
  "operaballetnl",
  "operaballet",
  "DutchNationalOperaBallet",
];

(async () => {
  for (const h of handles) {
    try {
      const r = await fetch(`https://www.youtube.com/@${h}`, {
        headers: { "User-Agent": "Mozilla/5.0" },
        redirect: "follow",
      });
      const t = await r.text();
      const m =
        t.match(/"channelId":"(UC[\w-]{22})"/) ||
        t.match(/"externalId":"(UC[\w-]{22})"/);
      console.log(JSON.stringify({ handle: h, status: r.status, id: m && m[1], url: r.url }));
    } catch (e) {
      console.log(JSON.stringify({ handle: h, error: String(e) }));
    }
  }
})();
