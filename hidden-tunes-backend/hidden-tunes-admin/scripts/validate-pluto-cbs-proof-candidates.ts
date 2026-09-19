import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadAdminEnv } from '../lib/radioExpansion25k/env';
import { getSupabaseAdmin } from '../lib/supabaseAdmin';
import { classifyKnownBadTvFrame } from '../lib/tvKnownBadContent';

const root = join(import.meta.dirname, '..');
const out = join(root, 'data', 'tv-recovery', 'placeholder-audit', 'restoration', 'cbs-proof');
const candidates = [
  { id: 'e6ea03b2-2ec7-4a43-8491-7e629e4b9d7b', expected: 'CBS News New York' },
  { id: '8e639b8c-3dac-4eec-bf5d-daa28e22f80c', expected: 'CBS News Los Angeles' },
];

function run(args: string[], timeout: number, stdout = false) {
  return new Promise<{ ok: boolean; bytes: Buffer }>((done) => {
    const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args],
      { windowsHide: true, stdio: stdout ? ['ignore', 'pipe', 'ignore'] : 'ignore' });
    const chunks: Buffer[] = [];
    child.stdout?.on('data', (x) => chunks.push(x));
    const timer = setTimeout(() => {
      if (child.pid) spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      child.kill('SIGKILL');
    }, timeout);
    child.once('close', (code) => { clearTimeout(timer); done({ ok: code === 0, bytes: Buffer.concat(chunks) }); });
    child.once('error', () => { clearTimeout(timer); done({ ok: false, bytes: Buffer.concat(chunks) }); });
  });
}

async function dHash(path: string) {
  const r = await run(['-i', path, '-vf', 'scale=9:8,format=gray', '-frames:v', '1', '-f', 'rawvideo', 'pipe:1'], 20_000, true);
  if (!r.ok || r.bytes.length < 72) return null;
  let bits = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += r.bytes[y * 9 + x] > r.bytes[y * 9 + x + 1] ? '1' : '0';
  return BigInt(`0b${bits}`).toString(16).padStart(16, '0');
}

async function main() {
  loadAdminEnv(root);
  await mkdir(out, { recursive: true });
  const db = getSupabaseAdmin();
  const { data, error } = await db.from('tv_videos').select('id,title,source_url').in('id', candidates.map((x) => x.id));
  if (error) throw error;
  const rows = new Map((data ?? []).map((x: any) => [x.id, x]));
  const results = [];
  for (const [index, candidate] of candidates.entries()) {
    const row: any = rows.get(candidate.id);
    if (!row?.source_url) throw new Error(`Candidate missing ${candidate.id}`);
    const frames = [];
    for (const second of [5, 25, 55]) {
      const path = join(out, `${index + 1}-${second}s.jpg`);
      const cap = await run(['-rw_timeout', '15000000', '-ss', String(second), '-i', row.source_url,
        '-frames:v', '1', '-vf', 'scale=640:-2', '-y', path], 50_000);
      const hash = cap.ok ? await dHash(path) : null;
      frames.push({ second, decoded: cap.ok, path, knownBad: hash ? classifyKnownBadTvFrame(hash) : null });
    }
    const continuity = await run(['-rw_timeout', '15000000', '-i', row.source_url, '-t', '120',
      '-map', '0:v:0', '-map', '0:a:0?', '-f', 'null', '-'], 180_000);
    results.push({ candidateRecordId: candidate.id, expectedIdentity: candidate.expected, catalogTitle: row.title,
      sourceHost: new URL(row.source_url).hostname, framesDecoded: frames.filter((x) => x.decoded).length,
      placeholderDetected: frames.some((x) => x.knownBad?.blocked), continuitySeconds: continuity.ok ? 120 : 0,
      identityConfidence: 'PENDING_VISUAL_REVIEW', frames });
  }
  const report = { completedAt: new Date().toISOString(), mode: 'READ_ONLY_PROOF_VALIDATION', productionWrites: 0,
    researched: 2, sourcesTested: 2, decoded: results.filter((x) => x.framesDecoded > 0).length,
    placeholderRejected: results.filter((x) => x.placeholderDetected).length,
    continuityPassed: results.filter((x) => x.continuitySeconds === 120).length,
    restored: 0, searchVerified: 0, desktopVerified: 0, results };
  await writeFile(join(out, 'validation.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, results: results.map(({ frames, ...x }) => x) }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
