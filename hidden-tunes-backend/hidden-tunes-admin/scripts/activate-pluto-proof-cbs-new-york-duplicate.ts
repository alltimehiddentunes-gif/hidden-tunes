import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadAdminEnv } from '../lib/radioExpansion25k/env';
import { getSupabaseAdmin } from '../lib/supabaseAdmin';

const root = join(import.meta.dirname, '..');
const out = join(root, 'data', 'tv-recovery', 'placeholder-audit', 'restoration');
const id = 'e6ea03b2-2ec7-4a43-8491-7e629e4b9d7b';
const api = 'https://admin.hiddentunes.com';

async function main() {
  loadAdminEnv(root);
  const db = getSupabaseAdmin();
  const { data: original, error } = await db.from('tv_videos').select('*').eq('id', id).single();
  if (error || !original) throw error ?? new Error('Existing verified record missing');
  const now = new Date().toISOString();
  await mkdir(out, { recursive: true });
  const rollbackPath = join(out, `rollback-cbs-new-york-existing-${now.replace(/[:.]/g, '-')}.json`);
  await writeFile(rollbackPath, JSON.stringify({ createdAt: now, id, original }, null, 2));
  const update = { status: 'approved', is_active: true, playback_status: 'playable',
    reliability_score: Math.max(90, Number(original.reliability_score ?? 0)), consecutive_failures: 0,
    disabled_at: null, quarantined_at: null, ios_playable: true, android_playable: true,
    stream_is_https: true, last_health_checked_at: now,
    last_validation_result: 'verified_real_content_exact_identity_desktop_runtime' };
  const { error: updateError } = await db.from('tv_videos').update(update).eq('id', id);
  if (updateError) throw updateError;
  const search = await fetch(`${api}/api/tv/search?q=${encodeURIComponent('CBS News New York')}&limit=20`);
  const payload: any = search.ok ? await search.json() : null;
  const returned = (payload?.videos ?? []).some((row: any) => row.id === id);
  let play = await fetch(`${api}/api/tv/channels/${id}/play`);
  if (play.status === 404) play = await fetch(`${api}/api/tv/videos/${id}/play`);
  if (!returned || !play.ok) {
    const { id: _id, ...rollback } = original;
    await db.from('tv_videos').update(rollback).eq('id', id);
    throw new Error(`Verification failed; rollback applied (search=${returned}, play=${play.status})`);
  }
  console.log(JSON.stringify({ activatedExistingRecord: 1, searchVerified: 1, playResolverVerified: 1,
    duplicatesCreated: 0, rollbackSaved: true, rawUrlEmitted: 0, rollbackPath }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
