#!/usr/bin/env bash
set -eu
cd /var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin
set -a
# shellcheck disable=SC1091
. ./.env.production
set +a

node <<'NODE'
const { createClient } = require("@supabase/supabase-js");
const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
(async () => {
  const playable = await s
    .from("concert_items")
    .select("id", { count: "exact", head: true })
    .eq("is_public", true)
    .eq("playback_status", "playable");
  const sources = await s
    .from("concert_sources")
    .select("id", { count: "exact", head: true });
  const rows = await s
    .from("concert_items")
    .select("is_live,is_upcoming,is_replay,country_code,language_code")
    .eq("is_public", true)
    .eq("playback_status", "playable")
    .limit(2000);
  let live = 0, upcoming = 0, replay = 0;
  const byCountry = {};
  const byLang = {};
  for (const row of rows.data || []) {
    if (row.is_live) live++;
    else if (row.is_upcoming) upcoming++;
    else replay++;
    const c = row.country_code || "UNK";
    const l = row.language_code || "unk";
    byCountry[c] = (byCountry[c] || 0) + 1;
    byLang[l] = (byLang[l] || 0) + 1;
  }
  const streams = await s
    .from("concert_streams")
    .select("provider,concert_item_id")
    .eq("playback_status", "playable")
    .limit(3000);
  const byProvider = {};
  for (const row of streams.data || []) {
    byProvider[row.provider] = (byProvider[row.provider] || 0) + 1;
  }
  console.log(
    JSON.stringify(
      {
        playable: playable.count,
        sources: sources.count,
        live,
        upcoming,
        replay,
        by_country: byCountry,
        by_language: byLang,
        by_provider: byProvider,
        err: playable.error && playable.error.message,
      },
      null,
      2
    )
  );
})();
NODE
