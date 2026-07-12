import {
  describeLectureSeedCatalog,
  ingestLectureSeedCatalog,
} from "@/lib/lectureSeedIngest";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(JSON.stringify(describeLectureSeedCatalog(), null, 2));
  const result = await ingestLectureSeedCatalog({ dry_run: dryRun });
  console.log(JSON.stringify(result, null, 2));
  if (!result.success) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[lectures] seed ingest failed", error);
  process.exit(1);
});
