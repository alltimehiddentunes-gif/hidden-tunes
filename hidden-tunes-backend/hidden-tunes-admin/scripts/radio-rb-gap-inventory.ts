/**
 * Compare Radio Browser inventory vs local catalog source UUIDs.
 *   npx tsx scripts/radio-rb-gap-inventory.ts
 */
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import { RADIO_BROWSER_SERVERS } from "@/lib/radioExpansion25k/sourceQueries";

const adminRoot = path.resolve(__dirname, "..");

async function fetchJson(url: string) {
  const res = await fetch(url, {
    headers: { "User-Agent": "HiddenTunesRadioExpansion/1.0", Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function main() {
  loadAdminEnv(adminRoot);
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const local = new Set<string>();
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("radio_stations")
      .select("source_station_id,source_name")
      .in("source_name", ["radio_browser", "radio-browser", "Radio Browser"])
      .range(offset, offset + 999);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data) {
      if (row.source_station_id) local.add(String(row.source_station_id).toLowerCase());
    }
    if (data.length < 1000) break;
    offset += 1000;
  }

  // Also pull from radio_station_sources if present.
  try {
    let srcOffset = 0;
    for (;;) {
      const { data, error } = await supabase
        .from("radio_station_sources")
        .select("source_station_id,source_name")
        .ilike("source_name", "%radio%browser%")
        .range(srcOffset, srcOffset + 999);
      if (error) break;
      if (!data?.length) break;
      for (const row of data) {
        if (row.source_station_id) local.add(String(row.source_station_id).toLowerCase());
      }
      if (data.length < 1000) break;
      srcOffset += 1000;
    }
  } catch {
    // optional table
  }

  let server: (typeof RADIO_BROWSER_SERVERS)[number] = RADIO_BROWSER_SERVERS[0];
  let rbUuids: string[] = [];
  for (const candidate of RADIO_BROWSER_SERVERS) {
    try {
      // Lightweight: count via countries list + per-country would be slow.
      // Use /json/stations with high page walk for uuids only fields.
      server = candidate;
      const sample = await fetchJson(
        `${candidate}/json/stations?hidebroken=false&limit=1&offset=0&order=votes&reverse=true`
      );
      if (Array.isArray(sample)) break;
    } catch {
      continue;
    }
  }

  const pageSize = 500;
  let page = 0;
  let rbBrokenish = 0;
  for (;;) {
    const rows = (await fetchJson(
      `${server}/json/stations?hidebroken=false&limit=${pageSize}&offset=${page * pageSize}&order=votes&reverse=true`
    )) as Array<{ stationuuid?: string; lastcheckok?: string | number }>;
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const row of rows) {
      const id = String(row.stationuuid || "").toLowerCase();
      if (!id) continue;
      rbUuids.push(id);
      if (String(row.lastcheckok) === "0") rbBrokenish += 1;
    }
    page += 1;
    if (rows.length < pageSize) break;
    if (page % 20 === 0) {
      console.log(JSON.stringify({ inventory_progress: { pages: page, rb_seen: rbUuids.length } }));
    }
    // Safety cap ~60k
    if (rbUuids.length >= 80_000) break;
    await new Promise((r) => setTimeout(r, 200));
  }

  const rbSet = new Set(rbUuids);
  let missing = 0;
  for (const id of rbSet) {
    if (!local.has(id)) missing += 1;
  }

  console.log(
    JSON.stringify(
      {
        local_radio_browser_uuids: local.size,
        radio_browser_uuids_seen: rbSet.size,
        radio_browser_marked_not_ok: rbBrokenish,
        missing_from_local: missing,
        server,
        pages_fetched: page,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
