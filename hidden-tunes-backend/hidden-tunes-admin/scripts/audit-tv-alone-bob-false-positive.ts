/**
 * Read-only: why does "Alone" search return Bob Esponja?
 *   npx tsx scripts/audit-tv-alone-bob-false-positive.ts
 */
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!;
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const id = "76b63cd0-b1f2-43ae-a6fb-30cfa62fa1e5";
  const { data, error } = await sb.from("tv_videos").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  const row = data as Record<string, unknown>;
  const hay: string[] = [];
  for (const [k, v] of Object.entries(row || {})) {
    const s = JSON.stringify(v ?? "").toLowerCase();
    if (s.includes("alone")) hay.push(`${k}=${s.slice(0, 200)}`);
  }
  console.log(
    JSON.stringify(
      {
        title: row.title,
        channel_name: row.channel_name,
        category: row.category,
        genre: row.genre,
        mood: row.mood,
        format: row.format,
        language: row.language,
        region: row.region,
        tags: row.tags,
        aloneFieldHits: hay,
      },
      null,
      2
    )
  );

  // Probe each search clause independently
  const clauses = [
    "title.ilike.%Alone%",
    "channel_name.ilike.%Alone%",
    "category.ilike.%Alone%",
    "genre.ilike.%Alone%",
    "mood.ilike.%Alone%",
    "format.ilike.%Alone%",
    "language.ilike.%Alone%",
    "region.ilike.%Alone%",
    "tags.cs.{alone}",
  ];
  for (const clause of clauses) {
    const { count } = await sb
      .from("tv_videos")
      .select("id", { count: "exact", head: true })
      .eq("id", id)
      .or(clause);
    console.log(`${clause} => ${count}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
