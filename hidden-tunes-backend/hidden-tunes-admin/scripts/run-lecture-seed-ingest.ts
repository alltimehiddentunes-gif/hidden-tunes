import {
  describeLectureSeedCatalog,
  ingestLectureSeedCatalog,
} from "@/lib/lectureSeedIngest";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  let limit: number | undefined;
  if (limitArg) {
    const parsedLimit = Number(limitArg.slice("--limit=".length));
    if (!Number.isFinite(parsedLimit) || parsedLimit < 1) {
      throw new Error("--limit must be a positive number.");
    }
    limit = parsedLimit;
  }
  console.log(JSON.stringify(describeLectureSeedCatalog(), null, 2));
  const result = await ingestLectureSeedCatalog({ dry_run: dryRun, limit });
  console.log(JSON.stringify(result, null, 2));
  if (!result.success) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[lectures] seed ingest failed", error);
  process.exit(1);
});
