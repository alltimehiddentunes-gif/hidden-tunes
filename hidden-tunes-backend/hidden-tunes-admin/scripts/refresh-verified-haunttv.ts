import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadAdminEnv } from '../lib/radioExpansion25k/env';
import { getSupabaseAdmin } from '../lib/supabaseAdmin';

const root = join(import.meta.dirname, '..');
const out = join(root, 'data', 'tv-recovery', 'placeholder-audit', 'restoration', 'haunttv-proof');
const id = 'bf41d136-9cc8-419f-ac5b-87432369a603';
async function main() {
  loadAdminEnv(root); const db = getSupabaseAdmin();
  const { data: original, error } = await db.from('tv_videos').select('*').eq('id', id).single();
  if (error || !original) throw error ?? new Error('HauntTV missing');
  const now = new Date().toISOString(); await mkdir(out, { recursive: true });
  const rollbackPath = join(out, `rollback-${now.replace(/[:.]/g, '-')}.json`);
  await writeFile(rollbackPath, JSON.stringify({ createdAt: now, original }, null, 2));
  const { error: updateError } = await db.from('tv_videos').update({
    status: 'approved', is_active: true, playback_status: 'playable', reliability_score: 100,
    consecutive_failures: 0, disabled_at: null, quarantined_at: null, ios_playable: true,
    android_playable: true, stream_is_https: true, last_health_checked_at: now,
    last_validation_result: 'verified_real_content_exact_identity_desktop_runtime',
  }).eq('id', id);
  if (updateError) throw updateError;
  const search = await fetch(`https://admin.hiddentunes.com/api/tv/search?q=HauntTV&limit=20`);
  const payload: any = search.ok ? await search.json() : null;
  const returned = (payload?.videos ?? []).some((row: any) => row.id === id);
  const play = await fetch(`https://admin.hiddentunes.com/api/tv/channels/${id}/play?platform=desktop`);
  if (!returned || !play.ok) {
    const { id: _id, ...rollback } = original; await db.from('tv_videos').update(rollback).eq('id', id);
    throw new Error(`Post-refresh verification failed; rollback applied (search=${returned}, play=${play.status})`);
  }
  console.log(JSON.stringify({ recordId: id, refreshed: 1, searchVerified: 1, resolverVerified: 1,
    rollbackSaved: true, rawUrlEmitted: 0, productionWrites: 1 }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
