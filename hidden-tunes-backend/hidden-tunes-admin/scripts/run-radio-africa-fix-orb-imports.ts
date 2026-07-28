/**
 * Rename generic ORB imports using Radioking / Radiojar page titles where possible.
 *   npx tsx scripts/run-radio-africa-fix-orb-imports.ts --execute
 */
import { createClient } from "@supabase/supabase-js";
import { loadAdminEnv } from "@/lib/radioExpansion25k/env";

async function radiokingName(streamUrl: string): Promise<string | null> {
  const m = streamUrl.match(/radioking\.com\/radio\/(\d+)/i);
  if (!m) return null;
  try {
    const res = await fetch(`https://api.radioking.io/widget/radio/${m[1]}`, {
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { name?: string; slug?: string };
    return json.name || json.slug || null;
  } catch {
    return null;
  }
}

async function main() {
  loadAdminEnv(process.cwd());
  const execute = process.argv.includes("--execute");
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const { data, error } = await supabase
    .from("radio_stations")
    .select("id,name,country_code,stream_url,source_server")
    .like("source_server", "%orb:%")
    .order("created_at", { ascending: false })
    .limit(80);
  if (error) throw error;

  const updates = [];
  for (const row of data || []) {
    const current = String(row.name || "").trim();
    if (current.length > 3 && !/^[a-z]{2}$/i.test(current)) continue;
    let next = await radiokingName(String(row.stream_url || ""));
    if (!next) {
      // Keep a slightly better placeholder from path.
      const path = String(row.source_server || "").split("orb:")[1] || "";
      const slug = path.split("/").filter(Boolean).pop();
      if (slug && slug.length > 2) next = slug.replace(/-/g, " ");
    }
    if (!next || next.toLowerCase() === current.toLowerCase()) continue;
    updates.push({ id: row.id, from: current, to: next, code: row.country_code });
    if (execute) {
      await supabase.from("radio_stations").update({ name: next }).eq("id", row.id);
    }
  }
  console.log(JSON.stringify({ execute, updates }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
