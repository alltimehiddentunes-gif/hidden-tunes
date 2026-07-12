import { ingestLectureSeedCatalog } from "@/lib/lectureSeedIngest";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

async function main() {
  const seedResult = await ingestLectureSeedCatalog({ limit: 1 });
  const checks = [
    {
      table: "lecture_items",
      constraint: "lecture_items_source_key_unique",
    },
    {
      table: "lecture_files",
      constraint: "lecture_files_source_key_unique",
    },
  ];

  const results = [];
  for (const check of checks) {
    const { data, error } = await supabaseAdmin
      .from(check.table)
      .select("source_key")
      .not("source_key", "is", null)
      .limit(1);

    results.push({
      table: check.table,
      constraint: check.constraint,
      readable: !error,
      error: error ? JSON.stringify(error) : null,
      sample_count: data?.length || 0,
    });
  }

  const success = seedResult.success && results.every((result) => result.readable);
  console.log(JSON.stringify({ success, seedResult, results }, null, 2));
  if (!success) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
