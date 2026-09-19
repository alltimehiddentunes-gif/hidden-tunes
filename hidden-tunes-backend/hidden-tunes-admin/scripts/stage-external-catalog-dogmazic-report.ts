import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

type JsonObject = Record<string, unknown>;

const argument = (name: string): string | null => {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || null;
};

const object = (value: unknown, label: string): JsonObject => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as JsonObject;
};

const array = (value: unknown, label: string): unknown[] => {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
};

const text = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
  return value.trim();
};

const sqlText = (value: unknown): string => {
  const encoded = Buffer.from(String(value), "utf8").toString("base64");
  return `convert_from(decode('${encoded}', 'base64'), 'UTF8')`;
};

const sqlNullableText = (value: unknown): string => value == null || value === "" ? "null" : sqlText(value);
const sqlNullableNumber = (value: unknown): string => typeof value === "number" && Number.isFinite(value) ? String(value) : "null";
const sqlNullableBoolean = (value: unknown): string => typeof value === "boolean" ? String(value) : "null";
const sqlJson = (value: unknown): string => `${sqlText(JSON.stringify(value))}::jsonb`;

function validateDatabaseUrl(raw: string): URL {
  const url = new URL(raw);
  const database = url.pathname.replace(/^\//, "");
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") throw new Error("Staging database URL must use postgresql://.");
  if (!new Set(["127.0.0.1", "localhost"]).has(url.hostname)) throw new Error("Dogmazic qualification staging is restricted to localhost.");
  if (!url.port || url.port === "5432") throw new Error("Dogmazic qualification staging requires an explicit non-default PostgreSQL port.");
  if (!/(?:qualification|_qual)(?:$|_)/i.test(database)) throw new Error("Dogmazic qualification staging database name must identify itself as qualification-only.");
  if (!url.username || !url.password) throw new Error("Staging database URL requires test-only credentials.");
  return url;
}

function buildSql(report: JsonObject): string {
  if (report.provider !== "dogmazic" || !["DRY_QUALIFICATION", "MEDIA_RIGHTS_QUALIFICATION"].includes(String(report.mode))) throw new Error("Only a Dogmazic qualification report may be staged.");
  const gates = object(report.gates, "report.gates");
  if (gates.ingestion !== false || gates.publishing !== false || gates.productionDatabase !== false) throw new Error("Staging requires ingestion, publishing, and production database gates to be false.");
  const items = array(report.items, "report.items").map((entry, index) => object(entry, `report.items[${index}]`));
  if (items.length !== report.discovered || items.length < 1 || items.length > 100) throw new Error("Report item count is invalid.");
  const capturedAt = text(report.capturedAt, "report.capturedAt");
  const batchFlags = { mode: "DRY_QUALIFICATION", downloads: false, taxonomy: false, ingestion: false, publishing: false, production: false };
  const statements = [
    "begin;",
    `insert into public.external_catalog_sources (provider_id, display_name, status, metadata, last_health_at) values ('dogmazic', 'Dogmazic', 'DISABLED', ${sqlJson({ adapter: "AMPACHE", qualificationOnly: true })}, ${sqlText(capturedAt)}::timestamptz) on conflict (provider_id) do update set display_name = excluded.display_name, last_health_at = excluded.last_health_at;`,
    `insert into public.external_catalog_batches (provider_id, requested_size, status, feature_flags) values ('dogmazic', ${items.length}, 'PAUSED', ${sqlJson(batchFlags)});`,
  ];

  for (const item of items) {
    const metadata = object(item.metadata, "item.metadata");
    const rightsInput = object(item.rightsInput, "item.rightsInput");
    const recording = object(rightsInput.recording, "item.rightsInput.recording");
    const composition = object(rightsInput.composition, "item.rightsInput.composition");
    const evaluation = object(item.rightsEvaluation, "item.rightsEvaluation");
    const evidenceSource = object(item.evidence || item.recordingEvidence, "item.evidence");
    const evidence: JsonObject = { ...evidenceSource, capturedAt: String(evidenceSource.capturedAt || evidenceSource.evidenceTimestamp || capturedAt) };
    const taxonomy = object(item.taxonomy, "item.taxonomy");
    const sourceItemId = text(item.sourceItemId, "item.sourceItemId");
    const sourceUrl = text(item.sourceUrl, "item.sourceUrl");
    const state = text(evaluation.nextState, "item.rightsEvaluation.nextState");
    if (state !== "RIGHTS_REVIEW" && state !== "RIGHTS_BLOCKED") throw new Error(`Refusing unsafe staged state ${state}.`);
    const itemSelector = `(select a.id from public.external_catalog_assets a join public.external_catalog_sources s on s.id = a.source_id where s.provider_id = 'dogmazic' and a.source_item_id = ${sqlText(sourceItemId)})`;
    statements.push(
      `insert into public.external_catalog_assets (source_id, batch_id, source_item_id, source_url, direct_media_url, title, artist, composer, album, duration_seconds, language, content_family, original_metadata, state, state_changed_at) select s.id, b.id, ${sqlText(sourceItemId)}, ${sqlText(sourceUrl)}, null, ${sqlNullableText(metadata.title)}, ${sqlNullableText(metadata.artist)}, ${sqlNullableText(metadata.composer)}, ${sqlNullableText(metadata.album)}, ${sqlNullableNumber(metadata.durationSeconds)}, ${sqlNullableText(metadata.language)}, 'MUSIC', ${sqlJson(metadata)}, ${sqlText(state)}, ${sqlText(capturedAt)}::timestamptz from public.external_catalog_sources s cross join lateral (select id from public.external_catalog_batches where provider_id = 'dogmazic' order by created_at desc limit 1) b where s.provider_id = 'dogmazic' on conflict (source_id, source_item_id) do update set batch_id = excluded.batch_id, source_url = excluded.source_url, direct_media_url = null, title = excluded.title, artist = excluded.artist, composer = excluded.composer, album = excluded.album, duration_seconds = excluded.duration_seconds, language = excluded.language, original_metadata = excluded.original_metadata, state = excluded.state, state_changed_at = excluded.state_changed_at, updated_at = now();`,
      `insert into public.external_catalog_rights (asset_id, recording_license_name, recording_license_identifier, recording_license_url, recording_attribution_text, recording_attribution_required, recording_commercial_use_allowed, recording_redistribution_allowed, recording_derivative_works_allowed, recording_jurisdiction, recording_rights_statement, recording_evidence_present, composition_license_name, composition_license_identifier, composition_license_url, composition_attribution_text, composition_attribution_required, composition_commercial_use_allowed, composition_redistribution_allowed, composition_derivative_works_allowed, composition_jurisdiction, composition_rights_statement, composition_evidence_present, rights_bucket, rights_decision, decision_reason, decided_at) values (${itemSelector}, ${sqlNullableText(recording.licenseName)}, ${sqlNullableText(recording.licenseIdentifier)}, ${sqlNullableText(recording.licenseUrl)}, ${sqlNullableText(recording.attributionText)}, ${sqlNullableBoolean(recording.attributionRequired)}, ${sqlNullableBoolean(recording.commercialUseAllowed)}, ${sqlNullableBoolean(recording.redistributionAllowed)}, ${sqlNullableBoolean(recording.derivativeWorksAllowed)}, ${sqlNullableText(recording.jurisdiction)}, ${sqlNullableText(recording.rightsStatement)}, ${sqlNullableBoolean(recording.evidencePresent)}, ${sqlNullableText(composition.licenseName)}, ${sqlNullableText(composition.licenseIdentifier)}, ${sqlNullableText(composition.licenseUrl)}, ${sqlNullableText(composition.attributionText)}, ${sqlNullableBoolean(composition.attributionRequired)}, ${sqlNullableBoolean(composition.commercialUseAllowed)}, ${sqlNullableBoolean(composition.redistributionAllowed)}, ${sqlNullableBoolean(composition.derivativeWorksAllowed)}, ${sqlNullableText(composition.jurisdiction)}, ${sqlNullableText(composition.rightsStatement)}, ${sqlNullableBoolean(composition.evidencePresent)}, ${sqlText(evaluation.bucket)}, ${sqlText(evaluation.decision)}, ${sqlText(evaluation.reason)}, ${sqlText(capturedAt)}::timestamptz) on conflict (asset_id) do update set recording_license_name = excluded.recording_license_name, recording_license_identifier = excluded.recording_license_identifier, recording_license_url = excluded.recording_license_url, recording_attribution_text = excluded.recording_attribution_text, recording_attribution_required = excluded.recording_attribution_required, recording_commercial_use_allowed = excluded.recording_commercial_use_allowed, recording_redistribution_allowed = excluded.recording_redistribution_allowed, recording_derivative_works_allowed = excluded.recording_derivative_works_allowed, recording_jurisdiction = excluded.recording_jurisdiction, recording_rights_statement = excluded.recording_rights_statement, recording_evidence_present = excluded.recording_evidence_present, composition_license_name = excluded.composition_license_name, composition_license_identifier = excluded.composition_license_identifier, composition_license_url = excluded.composition_license_url, composition_attribution_text = excluded.composition_attribution_text, composition_attribution_required = excluded.composition_attribution_required, composition_commercial_use_allowed = excluded.composition_commercial_use_allowed, composition_redistribution_allowed = excluded.composition_redistribution_allowed, composition_derivative_works_allowed = excluded.composition_derivative_works_allowed, composition_jurisdiction = excluded.composition_jurisdiction, composition_rights_statement = excluded.composition_rights_statement, composition_evidence_present = excluded.composition_evidence_present, rights_bucket = excluded.rights_bucket, rights_decision = excluded.rights_decision, decision_reason = excluded.decision_reason, decided_at = excluded.decided_at, updated_at = now();`,
      `insert into public.external_catalog_evidence (asset_id, evidence_type, evidence_url, captured_at, evidence_hash, metadata) select ${itemSelector}, 'RIGHTS', ${sqlText(evidence.evidenceUrl)}, ${sqlText(evidence.capturedAt)}::timestamptz, ${sqlText(evidence.evidenceHash)}, ${sqlJson({ provider: "dogmazic", sourceItemId, metadata, rightsInput, evaluation })} where not exists (select 1 from public.external_catalog_evidence where asset_id = ${itemSelector} and evidence_hash = ${sqlText(evidence.evidenceHash)});`,
      `insert into public.external_catalog_taxonomy (asset_id, classification_state, candidate_terms, unresolved_reason) values (${itemSelector}, 'UNRESOLVED', '[]'::jsonb, ${sqlText(`Provider genres retained (${JSON.stringify(taxonomy.providerGenres || [])}); canonical taxonomy phase not run.`)}) on conflict (asset_id) do update set classification_state = 'UNRESOLVED', candidate_terms = '[]'::jsonb, unresolved_reason = excluded.unresolved_reason, updated_at = now();`,
      `insert into public.external_catalog_events (asset_id, event_name, from_state, to_state, decision_reason, metadata) select ${itemSelector}, 'RIGHTS_REVIEW_REQUESTED', 'DISCOVERED', ${sqlText(state)}, ${sqlText(evaluation.reason)}, ${sqlJson({ provider: "dogmazic", qualificationOnly: true, capturedAt })} where not exists (select 1 from public.external_catalog_events where asset_id = ${itemSelector} and event_name = 'RIGHTS_REVIEW_REQUESTED' and metadata->>'capturedAt' = ${sqlText(capturedAt)});`,
    );
  }
  statements.push(
    "commit;",
    "select 'sources=' || count(*) from public.external_catalog_sources where provider_id = 'dogmazic';",
    "select 'batches=' || count(*) from public.external_catalog_batches where provider_id = 'dogmazic';",
    "select 'assets=' || count(*) from public.external_catalog_assets a join public.external_catalog_sources s on s.id = a.source_id where s.provider_id = 'dogmazic';",
    "select 'rights_review=' || count(*) from public.external_catalog_assets a join public.external_catalog_sources s on s.id = a.source_id where s.provider_id = 'dogmazic' and a.state = 'RIGHTS_REVIEW';",
    "select 'persisted_media_urls=' || count(*) from public.external_catalog_assets a join public.external_catalog_sources s on s.id = a.source_id where s.provider_id = 'dogmazic' and a.direct_media_url is not null;",
    "select 'production_song_links=' || count(*) from public.external_catalog_assets a join public.external_catalog_sources s on s.id = a.source_id where s.provider_id = 'dogmazic' and a.production_song_id is not null;",
  );
  return statements.join("\n");
}

async function main() {
  if (String(process.env.EXTERNAL_CATALOG_STAGING_WRITE_ENABLED || "").toLowerCase() !== "true") throw new Error("EXTERNAL_CATALOG_STAGING_WRITE_ENABLED=true is required.");
  const reportPath = argument("report");
  if (!reportPath) throw new Error("--report=<path> is required.");
  if (/^[cC]:[\\/]/.test(reportPath)) throw new Error("Dogmazic qualification report must be stored outside C:.");
  const databaseUrl = validateDatabaseUrl(text(process.env.EXTERNAL_CATALOG_STAGING_DATABASE_URL, "EXTERNAL_CATALOG_STAGING_DATABASE_URL"));
  const psqlPath = path.resolve(text(process.env.PSQL_PATH, "PSQL_PATH"));
  if (path.basename(psqlPath).toLowerCase() !== "psql.exe") throw new Error("PSQL_PATH must point to psql.exe.");
  const report = object(JSON.parse(await readFile(path.resolve(reportPath), "utf8")) as unknown, "report");
  const sql = buildSql(report);
  const database = databaseUrl.pathname.replace(/^\//, "");
  const tempSql = path.join("D:\\HiddenTunes\\Data\\external-acquisition\\tmp", `dogmazic-stage-${process.pid}-${Date.now()}.sql`);
  if (!/^[dD]:[\\/]/.test(path.resolve(tempSql))) throw new Error("Staging SQL must remain on D:.");
  await mkdir(path.dirname(tempSql), { recursive: true });
  await writeFile(tempSql, sql, "utf8");
  const child = spawn(psqlPath, ["-X", "-v", "ON_ERROR_STOP=1", "-h", databaseUrl.hostname, "-p", databaseUrl.port, "-U", decodeURIComponent(databaseUrl.username), "-d", database, "-f", tempSql], {
    env: { ...process.env, PGPASSWORD: decodeURIComponent(databaseUrl.password) },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += String(chunk); });
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  await rm(tempSql, { force: true });
  if (exitCode !== 0) throw new Error(`psql staging failed (${exitCode}): ${stderr.trim()}`);
  console.log(stdout.trim());
  console.log(JSON.stringify({ result: "DOGMAZIC_REPORT_STAGED", databaseHost: databaseUrl.hostname, databasePort: databaseUrl.port, database, production: false }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
