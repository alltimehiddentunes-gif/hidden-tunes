import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createDogmazicAdapterFromEnv } from "../lib/externalCatalogAcquisition/adapters/dogmazic";
import { createEvidenceSnapshot } from "../lib/externalCatalogAcquisition/provenance";
import { evaluateRights } from "../lib/externalCatalogAcquisition/rightsEvaluator";
import { resolveStoragePolicy } from "../lib/externalCatalogAcquisition/storagePolicy";

function argument(name: string): string | null {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || null;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function countBy(values: readonly string[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) result[value] = (result[value] || 0) + 1;
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

async function main() {
  const limit = Number(argument("limit") || "50");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("--limit must be an integer from 1 to 100.");
  const storage = resolveStoragePolicy();
  const reportsDirectory = path.join(storage.root, "reports");
  const output = argument("output") || path.join(reportsDirectory, `dogmazic-dry-${limit}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  const resolvedOutput = path.resolve(output);
  const resolvedRoot = path.resolve(storage.root);
  if (resolvedOutput !== resolvedRoot && !resolvedOutput.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error("Qualification report must remain under EXTERNAL_CATALOG_STORAGE_ROOT.");

  const adapter = createDogmazicAdapterFromEnv(process.env);
  const health = await adapter.healthCheck();
  if (!health.reachable) throw new Error(`Dogmazic health check failed: ${health.reason || "unknown"}`);
  const page = await adapter.discoverPage({ limit, cursor: argument("cursor") });
  const capturedAt = new Date().toISOString();
  const items = [];
  for (const discovered of page.items) {
    const metadata = adapter.normalize(discovered.metadata);
    const rightsInput = await adapter.fetchRights(discovered.sourceItemId);
    const rightsEvaluation = evaluateRights(rightsInput);
    const evidenceContent = canonicalJson({ provider: "dogmazic", sourceItemId: discovered.sourceItemId, sourceUrl: discovered.sourceUrl, metadata, rightsInput });
    const evidence = createEvidenceSnapshot({ evidenceUrl: String(metadata.licenseEvidenceUrl), content: evidenceContent, capturedAt });
    items.push({
      sourceItemId: discovered.sourceItemId,
      sourceUrl: discovered.sourceUrl,
      metadata,
      rightsInput,
      rightsEvaluation,
      evidence: { evidenceUrl: evidence.evidenceUrl, capturedAt: evidence.capturedAt, evidenceHash: evidence.evidenceHash },
      media: { status: "NOT_RESOLVED_DRY_QUALIFICATION", persistedUrl: false },
      quality: { status: "NOT_RUN_DRY_QUALIFICATION" },
      duplicate: { status: "NOT_RUN_DRY_QUALIFICATION" },
      taxonomy: { status: "UNRESOLVED", providerGenres: metadata.genres, canonicalTerms: [] },
      production: { published: false, ingestionAttempted: false },
    });
  }

  const report = {
    schemaVersion: 1,
    provider: "dogmazic",
    mode: "DRY_QUALIFICATION",
    requested: limit,
    discovered: items.length,
    capturedAt,
    health,
    policy: adapter.rateLimitPolicy(),
    capabilities: adapter.providerCapabilities(),
    nextCursor: page.nextCursor,
    counts: {
      licenses: countBy(items.map((item) => String(item.metadata.licenseName))),
      rightsBuckets: countBy(items.map((item) => item.rightsEvaluation.bucket)),
      nextStates: countBy(items.map((item) => item.rightsEvaluation.nextState)),
    },
    gates: { downloads: false, taxonomyClassification: false, ingestion: false, publishing: false, productionDatabase: false },
    items,
  };
  await mkdir(path.dirname(resolvedOutput), { recursive: true });
  await writeFile(resolvedOutput, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ result: "DOGMAZIC_DRY_QUALIFICATION_COMPLETE", output: resolvedOutput, requested: limit, discovered: items.length, counts: report.counts, gates: report.gates }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
