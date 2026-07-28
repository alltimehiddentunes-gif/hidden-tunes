#!/usr/bin/env node
/**
 * Backfill concert_items.artwork_url from YouTube provider_content_id when missing.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnv(path.join(root, ".env.production"));
loadEnv(path.join(root, ".env.local"));

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

let updated = 0;
let scanned = 0;
let from = 0;
const page = 500;

for (;;) {
  const { data, error } = await s
    .from("concert_items")
    .select("id, artwork_url, concert_streams(provider, provider_content_id)")
    .is("artwork_url", null)
    .range(from, from + page - 1);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) break;
  for (const row of data) {
    scanned += 1;
    const stream = Array.isArray(row.concert_streams)
      ? row.concert_streams[0]
      : row.concert_streams;
    if (!stream || stream.provider !== "youtube") continue;
    const id = String(stream.provider_content_id || "");
    if (!/^[\w-]{11}$/.test(id)) continue;
    const artwork = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    const { error: upErr } = await s
      .from("concert_items")
      .update({ artwork_url: artwork })
      .eq("id", row.id);
    if (!upErr) updated += 1;
  }
  if (data.length < page) break;
  from += page;
}

console.log(JSON.stringify({ scanned, updated }, null, 2));
