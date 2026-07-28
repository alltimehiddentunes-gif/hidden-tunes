/**
 * Local simulation of fixture detail path for a known ID.
 */
import { batchLoadMatchCards } from "../../lib/sports/home/fixtureCards";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

async function main() {
  const id = process.argv[2] || "06024c39-94df-4234-a41c-80acbbc3f7d3";
  const { data, error } = await supabaseAdmin
    .from("sports_fixtures")
    .select(
      "id, title, sport_id, competition_id, starts_at, ends_at, status, venue_id, country_code, metadata, availability_state, playable"
    )
    .eq("id", id)
    .in("status", [
      "verified",
      "scheduled",
      "live",
      "external_only",
      "degraded",
      "completed",
      "postponed",
      "cancelled",
      "geo_blocked",
    ])
    .maybeSingle();
  console.log("row", data?.title, data?.status, error?.message);
  if (!data) return;
  const cards = await batchLoadMatchCards([data as any]);
  console.log("cards", cards.length);
  console.log(JSON.stringify(cards[0], null, 2));
}

main().catch(console.error);
