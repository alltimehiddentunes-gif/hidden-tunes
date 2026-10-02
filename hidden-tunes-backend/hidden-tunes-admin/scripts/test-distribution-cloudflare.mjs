import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { aggregateCloudflare } from './aggregate-distribution-cloudflare.mjs';

const root = await mkdtemp(join(tmpdir(), 'distribution-cf-test-'));
const paths = [
  '/android/1.0.2/Hidden-Tunes-1.0.2-Android-Direct.apk',
  '/desktop/windows/1.0.1/Hidden-Tunes-Desktop-1.0.1-win-x64.exe',
  '/desktop/1.0.1/macos/Hidden-Tunes-Desktop-1.0.1-mac-universal.dmg',
  '/desktop/linux/1.0.1/Hidden-Tunes-Desktop-1.0.1-x86_64.AppImage',
  '/desktop/linux/1.0.1/Hidden-Tunes-Desktop-1.0.1-amd64.deb',
];
const ray = n => n.toString(16).padStart(16, '0');
const event = (n, patch = {}) => ({
  ClientRequestHost: 'downloads.hiddentunes.com', ClientRequestPath: paths[0], ClientRequestMethod: 'GET',
  EdgeResponseStatus: 200, EdgeResponseBodyBytes: 10, ClientCountry: 'gh',
  EdgeStartTimestamp: '2026-09-01T12:00:00Z', RayID: ray(n), ClientRequestSource: 'eyeball',
  ClientIP: '203.0.113.17', ClientRequestURI: paths[0] + '?secret=DO_NOT_STORE_TEST', ClientRequestUserAgent: 'PRIVATE_TEST_AGENT',
  ...patch,
});
const defaults = { from: '2026-09-01T00:00:00Z', to: '2026-09-02T00:00:00Z', evidenceId: 'synthetic_fixture', completeUnsampledExport: true };
let fixture = 0;
async function input(rows) {
  const path = join(root, 'fixture-' + ++fixture + '.jsonl');
  await writeFile(path, rows.map(row => JSON.stringify(row)).join('\n') + '\n');
  return path;
}
async function convert(rows, options = {}) { return aggregateCloudflare({ ...defaults, input: await input(rows), ...options }); }
const total = (result, metric) => result.rows.filter(row => row.metric === metric).reduce((sum, row) => sum + row.value, 0);
try {
  const original = paths.map((path, i) => event(i + 1, { ClientRequestPath: path }));
  const result = await convert([...original, original[0], event(6, { EdgeResponseStatus: 206, EdgeResponseBodyBytes: 5 }),
    event(7, { ClientRequestMethod: 'HEAD' }), event(8, { EdgeResponseStatus: 304 }), event(9, { EdgeResponseStatus: 404 }),
    event(10, { ClientRequestMethod: 'POST' }), event(11, { ClientRequestHost: 'unrelated.example' }),
    event(12, { ClientRequestSource: 'edgeWorkerFetch' })]);
  assert.equal(total(result, 'artifact_request'), 6);
  assert.equal(total(result, 'delivered_bytes'), 55);
  assert.deepEqual(new Set(result.rows.map(row => row.platform)), new Set(['android', 'windows', 'macos', 'linux']));
  assert.ok(result.rows.every(row => row.channel === 'unknown' && row.campaign === null && row.country === 'GH'));
  assert.equal(result.source.id, 'cloudflare_http_logpush');
  assert.ok(result.source.note.length <= 500);
  assert.ok(!result.metrics.includes('confirmed_delivery'));
  for (const forbidden of ['203.0.113.17', 'DO_NOT_STORE_TEST', 'PRIVATE_TEST_AGENT', 'ClientIP', 'RayID', paths[0]]) assert.ok(!JSON.stringify(result).includes(forbidden));

  const noBytes = event(2); delete noBytes.EdgeResponseBodyBytes;
  const incompleteBytes = await convert([event(1), noBytes]);
  assert.deepEqual(incompleteBytes.metrics, ['artifact_request']);
  assert.equal(total(incompleteBytes, 'artifact_request'), 2);
  assert.ok(!incompleteBytes.rows.some(row => row.metric === 'delivered_bytes'));
  assert.deepEqual((await convert([event(1, { EdgeResponseBodyBytes: -1 })])).metrics, ['artifact_request']);
  assert.equal((await convert([event(1, { ClientCountry: '203.0.113.17' })])).rows[0].country, 'ZZ');
  await assert.rejects(() => convert([event(1), event(1, { EdgeResponseStatus: 206 })]), /Conflicting duplicate/);
  await assert.rejects(() => convert([event(1)], { completeUnsampledExport: false }), /assertion/);
  await assert.rejects(() => convert([event(1, { RayID: 'not-a-ray' })]), /Ray ID/);
  await assert.rejects(() => convert([event(1, { ClientRequestPath: paths[0] + '?private=yes' })]), /exclude query/);
  await assert.rejects(() => convert([event(1, { EdgeStartTimestamp: 1788264000000000000 })]), /numeric timestamps/);
  await assert.rejects(() => convert([event(1, { ClientRequestUserAgent: 'x'.repeat(70 * 1024) })]), /row/);

  const boundary = await convert([
    event(1, { EdgeStartTimestamp: '2026-08-31T23:59:59.999999999Z' }),
    event(2, { EdgeStartTimestamp: '2026-09-01T00:00:00Z' }),
    event(3, { EdgeStartTimestamp: '2026-09-01T23:59:59.999999999Z' }),
    event(4, { EdgeStartTimestamp: '2026-09-02T00:00:00Z' }),
    event(5, { EdgeStartTimestamp: (BigInt(Date.parse(defaults.from)) * 1_000_000n + 1n).toString() }),
  ]);
  assert.equal(total(boundary, 'artifact_request'), 3);
  const excluded = join(root, 'excluded.txt'); await writeFile(excluded, ray(1) + '\n');
  assert.deepEqual((await convert([event(1)], { excludeRayIds: excluded })).rows, []);

  const script = fileURLToPath(new URL('./aggregate-distribution-cloudflare.mjs', import.meta.url));
  const output = join(root, 'aggregate.json'), localInput = await input([event(1)]);
  const args = [script, '--input', localInput, '--output', output, '--from', defaults.from, '--to', defaults.to, '--evidence-id', 'cli_fixture', '--complete-unsampled-export'];
  const run = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const before = await readFile(output, 'utf8');
  assert.equal(JSON.parse(before).rows[0].channel, 'unknown');
  assert.equal(spawnSync(process.execPath, args, { encoding: 'utf8' }).status, 1);
  assert.equal(await readFile(output, 'utf8'), before);
  const help = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0); assert.match(help.stdout, /complete-unsampled-export/);
  console.log('PASS Cloudflare aggregate converter: five artifacts, GET/status/range semantics, dedupe/conflicts, byte completeness, privacy, unknown channel, timestamp bounds, row limit, test exclusions and CLI output protection.');
} finally {
  const actual = await realpath(root), temporaryRoot = await realpath(tmpdir());
  assert.ok(actual.startsWith(resolve(temporaryRoot) + sep) && basename(actual).startsWith('distribution-cf-test-'));
  await rm(actual, { recursive: true, force: true });
}
