import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadAdminEnv } from '../lib/radioExpansion25k/env';
import { getSupabaseAdmin } from '../lib/supabaseAdmin';

const root = join(import.meta.dirname, '..');
const base = join(root, 'data', 'tv-recovery', 'placeholder-audit');
const dir = join(base, 'intensive-recovery');
const badMarker = 'known_bad_content:pluto_non_channel_placeholder';

function normalizeTitle(value: string) {
  return value
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\((?:360|480|540|576|720|1080|2160)p\)/gi, '')
    .replace(/\bpluto\s*tv\b/gi, '')
    .replace(/\b(?:channel|canal)\b/gi, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim().toLowerCase();
}

function probe(url: string) {
  return new Promise<boolean>((done) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      done(value);
    };
    const process = spawn('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-rw_timeout', '15000000', '-i', url,
      '-t', '35', '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-',
    ], { windowsHide: true, stdio: 'ignore' });
    const timer = setTimeout(() => {
      if (process.pid) spawn('taskkill', ['/PID', String(process.pid), '/T', '/F'],
        { windowsHide: true, stdio: 'ignore' });
      process.kill('SIGKILL');
      finish(false);
    }, 70_000);
    process.once('close', (code) => finish(code === 0));
    process.once('error', () => finish(false));
  });
}

async function main() {
  loadAdminEnv(root);
  await mkdir(dir, { recursive: true });
  const state = JSON.parse(await readFile(join(dir, 'state.json'), 'utf8'));
  const auditedIds = new Set(state.entries.map((entry: any) => entry.recordId));
  const db = getSupabaseAdmin();
  const catalog: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('tv_videos')
      .select('id,title,source_url,status,is_active,playback_status,quarantined_at,last_health_error')
      .eq('status', 'approved').eq('is_active', true).eq('playback_status', 'playable')
      .range(from, from + 999);
    if (error) throw error;
    catalog.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const eligible = catalog.filter((row) => row.source_url && !auditedIds.has(row.id) &&
    !row.quarantined_at && row.last_health_error !== badMarker);
  const byTitle = new Map<string, any[]>();
  for (const row of eligible) {
    const key = normalizeTitle(row.title ?? '');
    if (key.length < 4) continue;
    byTitle.set(key, [...(byTitle.get(key) ?? []), row]);
  }

  const pendingIds = [...new Set<string>(state.entries
    .filter((entry: any) => entry.recoveryState === 'PENDING')
    .map((entry: any) => entry.providerChannelId))];
  const candidates = pendingIds.map((id) => {
    const entries = state.entries.filter((entry: any) => entry.providerChannelId === id);
    const keys = [...new Set<string>(entries.map((entry: any) => normalizeTitle(entry.title)))];
    const matches = [...new Map(keys.flatMap((key: string) => byTitle.get(key) ?? []).map((row: any) => [row.id, row])).values()];
    return { id, entries, keys, matches };
  });
  const uniquePlans = candidates.filter((item) => item.matches.length === 1);
  // Once the unambiguous lane is exhausted, inspect at most two exact-title variants.
  // A technically healthy result remains review-only because duplicate titles alone do not prove identity.
  const matchMode = uniquePlans.length ? 'UNIQUE_EXACT_TITLE' : 'AMBIGUOUS_EXACT_TITLE';
  const plans = (uniquePlans.length ? uniquePlans : candidates.filter((item) => item.matches.length > 1)).slice(0, 50);
  if (!plans.length) throw new Error('No pending exact-title catalog matches remain');

  const startedAt = new Date().toISOString();
  const results: any[] = [];
  let cursor = 0;
  const workers = Array.from({ length: 2 }, async () => {
    while (cursor < plans.length) {
      const index = cursor++;
      const plan = plans[index];
      // One candidate per identity keeps the heartbeat batch bounded even when a host times out.
      // Remaining variants stay available for a later explicit retest lane.
      const attemptedRows = plan.matches.slice(0, 1);
      let row = attemptedRows[0];
      let passed = false;
      for (const candidate of attemptedRows) {
        row = candidate;
        passed = await probe(candidate.source_url);
        if (passed) break;
      }
      results[index] = {
        providerChannelId: plan.id,
        requestedTitles: plan.entries.map((entry: any) => entry.title),
        normalizedIdentity: plan.keys,
        candidateRecordId: row.id,
        candidateTitle: row.title,
        exactCandidateCount: plan.matches.length,
        attemptedCandidateCount: attemptedRows.length,
        sourceHost: new URL(row.source_url).hostname,
        freshContinuitySeconds: passed ? 35 : 0,
        classification: passed ? 'SOURCE_FOUND_NEEDS_IDENTITY_REVIEW' : 'SOURCE_FOUND_NEEDS_RETEST',
      };
    }
  });
  await Promise.all(workers);

  const now = new Date().toISOString();
  for (const entry of state.entries) {
    const result = results.find((item) => item.providerChannelId === entry.providerChannelId);
    if (!result) continue;
    entry.recoveryState = result.classification;
    entry.alternativeRecordId = result.candidateRecordId;
    entry.attempts.push({ at: now, method: 'EXACT_HEALTHY_CATALOG_TITLE_MATCH',
      result: result.classification, continuitySeconds: result.freshContinuitySeconds });
  }
  state.batch += 1;
  state.updatedAt = now;
  await writeFile(join(dir, 'state.json'), JSON.stringify(state, null, 2));
  const checkpoint = {
    batch: state.batch, lane: `EXACT_HEALTHY_CATALOG_MATCH:${matchMode}`, startedAt, completedAt: now,
    processedIdentities: plans.length,
    queueRowsClassified: state.entries.filter((entry: any) =>
      results.some((result) => result.providerChannelId === entry.providerChannelId)).length,
    healthyCandidates: results.filter((result) => result.freshContinuitySeconds === 35).length,
    promoted: 0, duplicates: 0,
    identityReviewRequired: results.filter((result) => result.classification === 'SOURCE_FOUND_NEEDS_IDENTITY_REVIEW').length,
    stillUnresolved: results.filter((result) => result.classification === 'SOURCE_FOUND_NEEDS_RETEST').length,
    remainingQueue: state.entries.filter((entry: any) => entry.recoveryState === 'PENDING').length,
    productionWrites: 0, results,
  };
  await writeFile(join(dir, `checkpoint-${String(state.batch).padStart(3, '0')}.json`), JSON.stringify(checkpoint, null, 2));
  await writeFile(join(dir, 'latest-checkpoint.json'), JSON.stringify(checkpoint, null, 2));
  console.log(JSON.stringify(checkpoint, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
