import { runPodcastFeedRefreshBatch } from "@/lib/podcastFeedRefreshWorker";

function readArg(name: string) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const limit = Number(readArg("limit") || 100);
  const staleHours = Number(readArg("stale-hours") || 24);
  const dryRun = hasFlag("dry-run");

  const result = await runPodcastFeedRefreshBatch({
    limit,
    stale_hours: staleHours,
    dry_run: dryRun,
  });

  console.log(JSON.stringify({ phase: "complete", result }, null, 2));
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
