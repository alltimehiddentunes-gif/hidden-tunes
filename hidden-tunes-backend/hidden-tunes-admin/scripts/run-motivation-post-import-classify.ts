import { runMotivationPostImportClassification } from "@/lib/motivationPostImportJobs";

async function main() {
  const limit = Number(process.argv[2] || "200");
  const result = await runMotivationPostImportClassification(limit);
  console.log(JSON.stringify(result, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
