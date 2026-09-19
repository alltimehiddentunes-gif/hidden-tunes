import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { classifyKnownBadTvFrame } from '../lib/tvKnownBadContent';

const root = join(import.meta.dirname, '..');
const dir = join(root, 'data', 'tv-recovery', 'placeholder-audit', 'restoration');
const manifestPath = join(dir, 'batch-001-manifest.json');
const evidenceDir = join(dir, 'batch-001-evidence');

function ffmpeg(args: string[], timeoutMs: number, captureStdout = false) {
  return new Promise<{ ok: boolean; stdout: Buffer }>((done) => {
    const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], {
      windowsHide: true, stdio: captureStdout ? ['ignore', 'pipe', 'ignore'] : 'ignore',
    });
    const chunks: Buffer[] = [];
    if (captureStdout && child.stdout) child.stdout.on('data', (chunk) => chunks.push(chunk));
    const timer = setTimeout(() => {
      if (child.pid) spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      child.kill('SIGKILL');
    }, timeoutMs);
    child.once('close', (code) => { clearTimeout(timer); done({ ok: code === 0, stdout: Buffer.concat(chunks) }); });
    child.once('error', () => { clearTimeout(timer); done({ ok: false, stdout: Buffer.concat(chunks) }); });
  });
}

async function hashFrame(path: string) {
  const result = await ffmpeg(['-i', path, '-vf', 'scale=9:8,format=gray', '-frames:v', '1', '-f', 'rawvideo', 'pipe:1'], 20_000, true);
  const bytes = result.stdout;
  if (!result.ok || bytes.length < 72) return null;
  let bits = '';
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1)
    bits += bytes[y * 9 + x] > bytes[y * 9 + x + 1] ? '1' : '0';
  return BigInt(`0b${bits}`).toString(16).padStart(16, '0');
}

async function validate(record: any, index: number) {
  const prefix = `${String(index + 1).padStart(2, '0')}-${record.recordId}`;
  const frameResults = [];
  for (const second of [5, 25, 55]) {
    const path = join(evidenceDir, `${prefix}-${second}s.jpg`);
    const capture = await ffmpeg(['-rw_timeout', '15000000', '-ss', String(second), '-i', record.candidatePlaybackUrl,
      '-frames:v', '1', '-vf', 'scale=640:-2', '-y', path], 50_000);
    const hash = capture.ok ? await hashFrame(path) : null;
    frameResults.push({ second, decoded: capture.ok, path, dHash: hash,
      knownBad: hash ? classifyKnownBadTvFrame(hash) : null });
  }
  const targetSeconds = index < 3 ? 120 : 35;
  const continuity = await ffmpeg(['-rw_timeout', '15000000', '-i', record.candidatePlaybackUrl,
    '-t', String(targetSeconds), '-map', '0:v:0', '-map', '0:a:0?', '-f', 'null', '-'], (targetSeconds + 50) * 1000);
  const decoded = frameResults.filter((frame) => frame.decoded).length;
  const placeholder = frameResults.some((frame) => frame.knownBad?.blocked);
  return {
    recordId: record.recordId,
    canonicalChannelName: record.canonicalChannelName,
    candidateRecordId: record.candidateRecordId,
    candidateTitle: record.candidateTitle,
    sourceHost: new URL(record.candidatePlaybackUrl).hostname,
    protocol: /\.m3u8(?:$|\?)/i.test(record.candidatePlaybackUrl) ? 'HLS' : 'OTHER',
    networkPass: decoded > 0,
    framesDecoded: decoded,
    continuityTargetSeconds: targetSeconds,
    continuityPass: continuity.ok,
    placeholderDetected: placeholder,
    identityConfidence: 'PENDING_VISUAL_REVIEW',
    frameResults,
  };
}

async function main() {
  await mkdir(evidenceDir, { recursive: true });
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const results: any[] = [];
  let cursor = 0;
  await Promise.all(Array.from({ length: 2 }, async () => {
    while (cursor < manifest.records.length) {
      const index = cursor++;
      results[index] = await validate(manifest.records[index], index);
    }
  }));
  const report = {
    batch: 1, completedAt: new Date().toISOString(), productionWrites: 0,
    candidates: results.length,
    networkPass: results.filter((row) => row.networkPass).length,
    continuityPass: results.filter((row) => row.continuityPass).length,
    placeholderDetected: results.filter((row) => row.placeholderDetected).length,
    identityReviewPending: results.length,
    results,
  };
  await writeFile(join(dir, 'batch-001-technical-validation.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, results: results.map(({ frameResults, ...row }) => row) }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
