/**
 * Bounded Sports provider import CLI.
 * Default: dry-run. Never a daemon. Never auto-scheduled.
 *
 *   npx tsx scripts/run-sports-import-provider.ts --provider=olympics
 *   npx tsx scripts/run-sports-import-provider.ts --provider=scorebat --fixtures
 *   npx tsx scripts/run-sports-import-provider.ts --provider=scorebat --limit=25
 */

import { importOlympicsProvider } from "../lib/sports/import/olympicsImport";
import { importScoreBatProvider } from "../lib/sports/import/scorebatImport";
import { redactSecrets } from "../lib/sports/http";

function parseArgs(argv: string[]) {
  const out: {
    provider?: string;
    dryRun: boolean;
    limit: number;
    fixtures: boolean;
    allowLive: boolean;
  } = {
    dryRun: true,
    limit: 20,
    fixtures: false,
    allowLive: false,
  };

  for (const arg of argv) {
    if (arg.startsWith("--provider=")) {
      out.provider = arg.slice("--provider=".length).trim();
    } else if (arg === "--dry-run" || arg === "--dry-run=true") {
      out.dryRun = true;
    } else if (arg === "--dry-run=false" || arg === "--apply") {
      out.dryRun = false;
    } else if (arg.startsWith("--limit=")) {
      out.limit = Math.min(100, Math.max(1, Number(arg.slice("--limit=".length)) || 20));
    } else if (arg === "--fixtures" || arg === "--fixtures=true") {
      out.fixtures = true;
    } else if (arg === "--live" || arg === "--allow-live") {
      out.allowLive = true;
    }
  }

  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.provider) {
    console.error(
      "Error: --provider=<slug> is required. Example: --provider=scorebat"
    );
    process.exit(1);
  }

  if (args.provider !== "olympics" && args.provider !== "scorebat") {
    console.error(
      `Error: supported providers: olympics, scorebat (got "${args.provider}").`
    );
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        starting: true,
        provider: args.provider,
        dryRun: args.dryRun,
        limit: args.limit,
        fixtures: args.fixtures,
        allowLive: args.allowLive,
      },
      null,
      2
    )
  );

  const report =
    args.provider === "scorebat"
      ? await importScoreBatProvider({
          dryRun: args.dryRun,
          limit: args.limit,
          useFixtures: args.fixtures || !args.allowLive,
          allowLive: args.allowLive,
        })
      : await importOlympicsProvider({
          dryRun: args.dryRun,
          limit: args.limit,
          useFixtures: args.fixtures,
        });

  console.log(JSON.stringify(redactSecrets(report), null, 2));

  if (
    "errors" in report &&
    Array.isArray(report.errors) &&
    report.errors.length > 0 &&
    report.accepted === 0
  ) {
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
