import assert from "node:assert/strict";

import {
  listAudiobookAdapterSourceKeys,
  listAudiobookSourceAdapters,
} from "@/lib/audiobookSources/adapterRegistry";
import { resolveInternetArchiveQuery } from "@/lib/audiobookSources/internetArchiveQueries";

function main() {
  const general = listAudiobookAdapterSourceKeys("general");
  const mature = listAudiobookAdapterSourceKeys("mature");

  assert.ok(general.length >= 5, "expected multiple general providers");
  assert.ok(mature.length >= 3, "expected multiple mature providers");
  assert.ok(
    general.every((key) => !key.includes("mature")),
    "general keys must not include mature providers"
  );
  assert.ok(
    mature.every((key) => key.includes("mature")),
    "mature keys should identify mature providers"
  );

  for (const key of [...general, ...mature]) {
    const definition = resolveInternetArchiveQuery(key);
    assert.ok(definition, `missing query definition for ${key}`);
    assert.ok(definition.query.includes("mediatype:audio"));
    assert.ok(
      definition.query.toLowerCase().includes("creativecommons") ||
        definition.query.toLowerCase().includes("public domain")
    );
  }

  const adapters = listAudiobookSourceAdapters();
  assert.equal(adapters.length, general.length + mature.length);

  console.log(
    JSON.stringify(
      {
        success: true,
        general_providers: general.length,
        mature_providers: mature.length,
        general,
        mature,
      },
      null,
      2
    )
  );
}

main();
