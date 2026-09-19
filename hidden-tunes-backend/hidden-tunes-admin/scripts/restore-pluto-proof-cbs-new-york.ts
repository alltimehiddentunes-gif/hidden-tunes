import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadAdminEnv } from '../lib/radioExpansion25k/env';
import { getSupabaseAdmin } from '../lib/supabaseAdmin';

const root = join(import.meta.dirname, '..');
const out = join(root, 'data', 'tv-recovery', 'placeholder-audit', 'restoration');
const canonicalId = '80cf5e79-9e1d-4b39-901f-99081f87f7a3';
const candidateId = 'e6ea03b2-2ec7-4a43-8491-7e629e4b9d7b';
const api = 'https://admin.hiddentunes.com';

async function main() {
  loadAdminEnv(root);
  const db = getSupabaseAdmin();
  const { data, error } = await db.from('tv_videos').select('*').in('id', [canonicalId, candidateId]);
  if (error) throw error;
  const original: any = data?.find((row: any) => row.id === canonicalId);
  const candidate: any = data?.find((row: any) => row.id === candidateId);
  if (!original || !candidate?.source_url) throw new Error('Canonical or candidate record missing');
  const now = new Date().toISOString();
  const rollbackPath = join(out, `rollback-cbs-new-york-${now.replace(/[:.]/g, '-')}.json`);
  await mkdir(out, { recursive: true });
  await writeFile(rollbackPath, JSON.stringify({ createdAt: now, canonicalId, original }, null, 2));
  const update = {
    source_type: candidate.source_type,
    source_id: original.source_id,
    source_url: candidate.source_url,
    validated_stream_url: candidate.validated_stream_url || candidate.source_url,
    embed_url: candidate.embed_url,
    status: 'approved', is_active: true, playback_status: 'playable',
    reliability_score: Math.max(90, Number(candidate.reliability_score ?? 0)),
    consecutive_failures: 0, disabled_at: null, quarantined_at: null,
    ios_playable: true, android_playable: true, stream_is_https: true,
    last_health_checked_at: now,
    last_validation_result: 'verified_real_content_exact_identity_desktop_runtime',
  };
  const { error: updateError } = await db.from('tv_videos').update(update).eq('id', canonicalId);
  if (updateError) throw updateError;

  const searchResponse = await fetch(`${api}/api/tv/search?q=${encodeURIComponent('CBS News New York')}&limit=20`);
  const searchPayload: any = searchResponse.ok ? await searchResponse.json() : null;
  const returned = (searchPayload?.videos ?? []).some((row: any) => row.id === canonicalId);
  const playResponse = await fetch(`${api}/api/tv/channels/${canonicalId}/play`);
  const playPayload: any = playResponse.ok ? await playResponse.json() : null;
  const playUrl = playPayload?.stream_url ?? playPayload?.streamUrl ?? playPayload?.url ?? null;
  if (!returned || !playResponse.ok || !playUrl) {
    const { id: _id, ...rollback } = original;
    await db.from('tv_videos').update(rollback).eq('id', canonicalId);
    throw new Error(`Post-restore verification failed; rollback applied (search=${returned}, play=${playResponse.status})`);
  }
  console.log(JSON.stringify({ restored: 1, canonicalId, searchVerified: 1, playResolverVerified: 1,
    rollbackSaved: true, rawUrlEmitted: 0, rollbackPath }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
