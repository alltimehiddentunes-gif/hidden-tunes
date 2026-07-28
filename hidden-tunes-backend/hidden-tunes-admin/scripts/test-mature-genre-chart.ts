import { discoverMaturePodcastFeedsFromItunesGenreChart } from "@/lib/podcastItunesDiscovery";

async function main() {
  for (const country of ["US", "GB", "DE", "BR", "FR", "JP"]) {
    const feeds = await discoverMaturePodcastFeedsFromItunesGenreChart({
      country,
      genre_id: "1512",
      limit: 50,
    });
    console.log(
      JSON.stringify({
        country,
        count: feeds.length,
        sample: feeds.slice(0, 3).map((feed) => feed.title),
      })
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
