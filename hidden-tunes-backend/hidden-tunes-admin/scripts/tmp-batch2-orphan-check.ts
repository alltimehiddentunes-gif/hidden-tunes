import fs from "node:fs";
import path from "node:path";

const adminRoot = process.cwd();
for (const f of [".env.local", ".env"]) {
  const p = path.join(adminRoot, f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}

const result = JSON.parse(
  fs.readFileSync(path.join(adminRoot, "data/podcast-expansion-batch2-result.json"), "utf8")
);
const errorUrls = (result.errors || []).map((e: { feed_url: string }) => e.feed_url);

const { supabaseAdmin } = await import("../lib/supabaseAdmin.js");
const { data: errorShows } = await supabaseAdmin
  .from("podcast_shows")
  .select("id, title, feed_url, created_at")
  .in("feed_url", errorUrls);

console.log(
  JSON.stringify(
    {
      error_feeds: errorUrls.length,
      error_shows_in_db: errorShows?.length || 0,
      error_shows: errorShows,
    },
    null,
    2
  )
);
