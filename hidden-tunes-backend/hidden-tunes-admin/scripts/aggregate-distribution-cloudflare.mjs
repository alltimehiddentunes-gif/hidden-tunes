import { createReadStream } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const HOST = 'downloads.hiddentunes.com';
const ARTIFACTS = new Map([
  ['/android/1.0.2/Hidden-Tunes-1.0.2-Android-Direct.apk', ['android', '1.0.2']],
  ['/desktop/windows/1.0.1/Hidden-Tunes-Desktop-1.0.1-win-x64.exe', ['windows', '1.0.1']],
  ['/desktop/1.0.1/macos/Hidden-Tunes-Desktop-1.0.1-mac-universal.dmg', ['macos', '1.0.1']],
  ['/desktop/linux/1.0.1/Hidden-Tunes-Desktop-1.0.1-x86_64.AppImage', ['linux', '1.0.1']],
  ['/desktop/linux/1.0.1/Hidden-Tunes-Desktop-1.0.1-amd64.deb', ['linux', '1.0.1']],
]);
const MAX_FILE = 512 * 1024 * 1024, MAX_LINE = 64 * 1024, MAX_ROWS = 1_000_000;
const RAY = /^[a-f0-9]{16}$/i;
class ConversionError extends Error {}
function fail(message) { throw new ConversionError(message); }
function instant(value) {
  if (typeof value !== 'string') fail('Use RFC3339 strings or decimal-string nanosecond timestamps; numeric timestamps are not accepted.');
  if (/^\d{18,20}$/.test(value)) return BigInt(value);
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/.exec(value);
  if (!match) fail('Invalid UTC timestamp.');
  const ms = Date.parse(match[1] + 'Z');
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 19) !== match[1]) fail('Invalid UTC timestamp.');
  return BigInt(ms) * 1_000_000n + BigInt((match[2] || '').padEnd(9, '0'));
}
function coverageInstant(value) {
  const ns = instant(value);
  if (ns % 1_000_000n !== 0n) fail('Coverage boundaries must use whole milliseconds.');
  const ms = Number(ns / 1_000_000n);
  if (!Number.isSafeInteger(ms) || ms < 0 || ms > Date.now() + 60_000) fail('Invalid evidence coverage.');
  return { ns, ms, iso: new Date(ms).toISOString() };
}
async function* lines(input, hash) {
  const metadata = await stat(input);
  if (!metadata.isFile() || metadata.size > MAX_FILE) fail('Export must be a regular JSONL file no larger than 512 MiB.');
  let pending = Buffer.alloc(0), bytes = 0, count = 0;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for await (const chunk of createReadStream(input, { highWaterMark: MAX_LINE })) {
    bytes += chunk.length;
    if (bytes > MAX_FILE) fail('Export exceeds 512 MiB.');
    hash.update(chunk);
    pending = Buffer.concat([pending, chunk]);
    let end;
    while ((end = pending.indexOf(10)) !== -1) {
      if (end > MAX_LINE || ++count > MAX_ROWS) fail('Export row size or count limit exceeded.');
      yield decoder.decode(pending.subarray(0, end)).trim();
      pending = pending.subarray(end + 1);
    }
    if (pending.length > MAX_LINE) fail('Export row exceeds 64 KiB.');
  }
  if (pending.length) {
    if (++count > MAX_ROWS) fail('Export row count limit exceeded.');
    yield decoder.decode(pending).trim();
  }
}
async function exclusions(path) {
  if (!path) return new Set();
  if ((await stat(path)).size > 128 * 1024) fail('Test exclusion file is too large.');
  const ids = (await readFile(path, 'utf8')).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (ids.length > 4096 || ids.some(id => !RAY.test(id))) fail('Test exclusions must contain at most 4096 hexadecimal Ray IDs.');
  return new Set(ids.map(id => id.toLowerCase()));
}

/** Reads a local export and returns only allowlisted daily aggregates; never contacts a service. */
export async function aggregateCloudflare(options) {
  if (options.completeUnsampledExport !== true) fail('An explicit complete-unsampled-export assertion is required.');
  if (typeof options.input !== 'string' || !options.input || !/^[a-z0-9_-]{1,120}$/i.test(options.evidenceId || '')) fail('Input and a safe evidence ID are required.');
  const from = coverageInstant(options.from), to = coverageInstant(options.to);
  if (from.ns >= to.ns || to.ms - from.ms > 3660 * 86_400_000) fail('Invalid evidence coverage.');
  const excluded = await exclusions(options.excludeRayIds);
  const seen = new Map(), groups = new Map(), hash = createHash('sha256');
  let matched = 0, allBytesKnown = true;
  for await (const line of lines(options.input, hash)) {
    if (!line) continue;
    let row;
    try { row = JSON.parse(line); } catch { fail('Export contains invalid JSONL. No raw record was printed.'); }
    if (!row || Array.isArray(row) || typeof row !== 'object' || typeof row.ClientRequestHost !== 'string' || typeof row.ClientRequestPath !== 'string') fail('Export is missing required host/path fields.');
    if (row.ClientRequestHost !== HOST) continue;
    if (!ARTIFACTS.has(row.ClientRequestPath)) {
      if ([...ARTIFACTS.keys()].some(path => row.ClientRequestPath.startsWith(path + '?'))) fail('ClientRequestPath must exclude query strings.');
      continue;
    }
    if (row.ClientRequestSource != null && row.ClientRequestSource !== 'eyeball') continue;
    if (typeof row.RayID !== 'string' || !RAY.test(row.RayID)) fail('A valid Ray ID is required for each installer request.');
    const ray = row.RayID.toLowerCase();
    if (excluded.has(ray)) continue;
    if (typeof row.ClientRequestMethod !== 'string' || !Number.isInteger(row.EdgeResponseStatus) || row.EdgeResponseStatus < 100 || row.EdgeResponseStatus > 599) fail('Installer request method or status is invalid.');
    const time = instant(row.EdgeStartTimestamp);
    const country = typeof row.ClientCountry === 'string' && /^[a-z]{2}$/i.test(row.ClientCountry) ? row.ClientCountry.toUpperCase() : 'ZZ';
    const body = Number.isSafeInteger(row.EdgeResponseBodyBytes) && row.EdgeResponseBodyBytes >= 0 ? row.EdgeResponseBodyBytes : null;
    const signature = JSON.stringify([row.ClientRequestPath, row.ClientRequestMethod, row.EdgeResponseStatus, time.toString(), country, body]);
    if (seen.has(ray)) {
      if (seen.get(ray) !== signature) fail('Conflicting duplicate Ray ID; export rejected.');
      continue;
    }
    seen.set(ray, signature);
    if (time < from.ns || time >= to.ns || row.ClientRequestMethod !== 'GET' || ![200, 206].includes(row.EdgeResponseStatus)) continue;
    const [platform, version] = ARTIFACTS.get(row.ClientRequestPath);
    const date = new Date(Number(time / 1_000_000n)).toISOString().slice(0, 10);
    const key = JSON.stringify([date, platform, version, country]);
    const group = groups.get(key) || { date, platform, channel: 'unknown', country, version, campaign: null, requests: 0, bytes: 0 };
    group.requests++;
    matched++;
    if (body === null) allBytesKnown = false;
    else {
      group.bytes += body;
      if (!Number.isSafeInteger(group.bytes)) fail('Byte aggregate exceeds the safe integer range.');
    }
    groups.set(key, group);
  }
  const includeBytes = matched > 0 && allBytesKnown;
  const rows = [];
  let totalBytes = 0;
  for (const group of groups.values()) {
    const { requests, bytes, ...dimensions } = group;
    totalBytes += bytes;
    if (!Number.isSafeInteger(totalBytes)) fail('Total bytes exceed the safe integer range.');
    rows.push({ ...dimensions, metric: 'artifact_request', value: requests });
    if (includeBytes) rows.push({ ...dimensions, metric: 'delivered_bytes', value: bytes });
  }
  if (rows.length > 50_000) fail('Aggregate exceeds the import row limit; use a shorter interval.');
  rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return {
    schemaVersion: 1,
    evidenceId: options.evidenceId,
    source: {
      id: 'cloudflare_http_logpush', label: 'Cloudflare HTTP Logpush',
      freshness: 'MANUAL IMPORT',
      note: 'Operator-attested complete unsampled eyeball export; known qualification traffic removed/excluded. GETs to five allowlisted installer paths returning 200/206; ranges/retries are requests. Channel unknown. No installation or completed-delivery claim. Body bytes only if every matched request has a valid count. Export SHA-256: ' + hash.digest('hex'),
    },
    coverage: { from: from.iso, to: to.iso },
    metrics: includeBytes ? ['artifact_request', 'delivered_bytes'] : ['artifact_request'],
    rows,
  };
}
const HELP = 'Usage: node scripts/aggregate-distribution-cloudflare.mjs --input export.jsonl --output evidence.json --from 2026-09-01T00:00:00Z --to 2026-09-02T00:00:00Z --evidence-id cf_20260901_v1 --complete-unsampled-export [--exclude-ray-ids qualification-rays.txt]\n\nThe assertion confirms complete, unsampled, eyeball-only coverage and removal/exclusion of known test traffic. Output is a new aggregate JSON file; no database or network access. Existing output files are never overwritten. Read docs/distribution-cloudflare-import.md first.';
async function main(args) {
  if (args.length === 1 && args[0] === '--help') { console.log(HELP); return; }
  const names = { '--input': 'input', '--output': 'output', '--from': 'from', '--to': 'to', '--evidence-id': 'evidenceId', '--exclude-ray-ids': 'excludeRayIds' };
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--complete-unsampled-export' && !options.completeUnsampledExport) { options.completeUnsampledExport = true; continue; }
    const key = names[args[i]];
    if (!key || options[key] !== undefined || !args[i + 1] || args[i + 1].startsWith('--')) fail('Invalid arguments. Use --help.');
    options[key] = args[++i];
  }
  if (!options.output) fail('An output file is required. Use --help.');
  const aggregate = await aggregateCloudflare(options);
  await writeFile(options.output, JSON.stringify(aggregate, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log('Aggregate evidence written: ' + aggregate.rows.length + ' rows; metrics: ' + aggregate.metrics.join(', ') + '. No database changes.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error instanceof ConversionError ? error.message : 'Conversion failed. Check local file access/encoding and ensure the output file does not already exist. No raw data was printed.');
    process.exitCode = 1;
  });
}
