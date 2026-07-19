/**
 * Validates expanded radio text-search coverage against the local/prod Supabase catalog.
 * Does not mutate data.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import {
  applyPublicRadioFilters,
  buildRadioTextSearchOrFilter,
} from "../lib/radioPublicCatalog";

async function countFiltered(sb: any, filters: Parameters<typeof applyPublicRadioFilters>[1]) {
  let query = sb.from("radio_stations").select("id", { count: "exact", head: true });
  query = applyPublicRadioFilters(query, filters);
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

async function samplePage(
  sb: any,
  filters: Parameters<typeof applyPublicRadioFilters>[1],
  limit = 5
) {
  let query = sb
    .from("radio_stations")
    .select("name")
    .order("reliability_score", { ascending: false })
    .order("created_at", { ascending: false })
    .range(0, limit - 1);
  query = applyPublicRadioFilters(query, filters);
  const { data, error } = await query;
  if (error) throw error;
  return ((data || []) as Array<{ name?: string }>).map((row) => row.name);
}

async function main() {
  config({ path: ".env.local" });
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });

  const cases = [
    "BBC",
    "bbc world",
    "jazz",
    "Ghana",
    "Accra",
    "English",
    "California",
    "rock",
    "Asaase",
    "zzznope",
  ];

  const baseline = await countFiltered(sb, {});
  const httpsOnly = await countFiltered(sb, { httpsOnly: true });

  console.log(
    JSON.stringify(
      {
        searchOrExample: buildRadioTextSearchOrFilter("Accra"),
        eligible_all: baseline,
        eligible_https_only: httpsOnly,
      },
      null,
      2
    )
  );

  for (const q of cases) {
    const total = await countFiltered(sb, { searchQuery: q });
    const https = await countFiltered(sb, { searchQuery: q, httpsOnly: true });
    const sample = await samplePage(sb, { searchQuery: q, httpsOnly: true }, 3);
    console.log(
      JSON.stringify({
        q,
        total,
        https_only: https,
        sample,
      })
    );
  }

  // Page 2 proof for jazz https
  let page2: any = sb
    .from("radio_stations")
    .select("name")
    .order("reliability_score", { ascending: false })
    .order("created_at", { ascending: false })
    .range(40, 44);
  page2 = applyPublicRadioFilters(page2, {
    searchQuery: "jazz",
    httpsOnly: true,
  });
  const { data: page2Rows, error: page2Error } = await page2;
  if (page2Error) throw page2Error;
  console.log(
    JSON.stringify({
      jazz_https_page2_sample: ((page2Rows || []) as Array<{ name?: string }>).map(
        (row) => row.name
      ),
    })
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
