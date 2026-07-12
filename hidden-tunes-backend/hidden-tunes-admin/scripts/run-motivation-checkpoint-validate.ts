import { validateMotivationCheckpointFiles } from "@/lib/motivationExpansionCheckpoint";

async function main() {
  const batchIndex = process.argv.indexOf("--batch");
  const batchNumber =
    batchIndex >= 0 ? Number(process.argv[batchIndex + 1]) : undefined;

  const result = validateMotivationCheckpointFiles(
    Number.isFinite(batchNumber) ? batchNumber : undefined
  );

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
