import { listSportsFixturesFiltered } from "../../lib/sports/fixtures/listFixtures";

async function main() {
  const all = await listSportsFixturesFiltered({ limit: 50 });
  console.log("all filtered", all.items.length);
  for (const it of all.items) {
    console.log(
      it.status.code,
      it.competition?.name,
      it.participants.map((p) => p.name).join(" vs "),
      it.watchability.playable
    );
  }
  const de = await listSportsFixturesFiltered({ country: "DE", limit: 20 });
  console.log("\nDE filtered", de.items.length);
  for (const it of de.items) {
    console.log(
      it.status.code,
      it.participants.map((p) => `${p.name}${p.score != null ? `(${p.score})` : ""}`).join(" vs ")
    );
  }
}

main().catch(console.error);
