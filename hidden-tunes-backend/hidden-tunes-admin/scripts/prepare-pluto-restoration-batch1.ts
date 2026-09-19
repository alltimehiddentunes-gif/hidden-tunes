import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadAdminEnv } from '../lib/radioExpansion25k/env';
import { getSupabaseAdmin } from '../lib/supabaseAdmin';

const root = join(import.meta.dirname, '..');
const recoveryDir = join(root, 'data', 'tv-recovery', 'placeholder-audit', 'restoration');
const statePath = join(root, 'data', 'tv-recovery', 'placeholder-audit', 'intensive-recovery', 'state.json');

async function main() {
  loadAdminEnv(root);
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  const selected = state.entries
    .filter((entry: any) => entry.recoveryState === 'SOURCE_FOUND_NEEDS_RETEST' && entry.alternativeRecordId)
    .slice(0, 10);
  if (selected.length !== 10) throw new Error(`Expected 10 retest candidates, found ${selected.length}`);

  const ids = [...new Set(selected.flatMap((entry: any) => [entry.recordId, entry.alternativeRecordId]))];
  const db = getSupabaseAdmin();
  const { data, error } = await db.from('tv_videos').select('*').in('id', ids);
  if (error) throw error;
  const rows = new Map((data ?? []).map((row: any) => [row.id, row]));
  const manifest = {
    batch: 1,
    purpose: 'PLUTO_QUARANTINE_RECOVERY_SEARCH_RESTORATION_PROOF',
    createdAt: new Date().toISOString(),
    productionWrites: 0,
    selectionRule: 'FIRST_10_SOURCE_FOUND_NEEDS_RETEST_WITH_EXISTING_CANDIDATE',
    records: selected.map((entry: any) => {
      const original: any = rows.get(entry.recordId);
      const candidate: any = rows.get(entry.alternativeRecordId);
      if (!original || !candidate) throw new Error(`Missing database row for ${entry.recordId}`);
      return {
        recordId: entry.recordId,
        canonicalChannelName: entry.title,
        providerChannelId: entry.providerChannelId,
        region: original.country_code ?? original.country ?? original.region ?? null,
        language: original.language_code ?? original.language ?? null,
        category: original.category ?? original.genre ?? null,
        quarantineReason: entry.reason,
        quarantinedAt: entry.quarantinedAt,
        oldPlaybackUrl: original.source_url,
        candidateRecordId: candidate.id,
        candidateTitle: candidate.title,
        candidatePlaybackUrl: candidate.source_url,
        candidateSourceType: candidate.source_type ?? null,
        candidateProvider: candidate.provider ?? candidate.source_provider ?? null,
        candidateStatus: candidate.status,
        candidateActive: candidate.is_active,
        candidatePlaybackStatus: candidate.playback_status,
        candidateQuarantinedAt: candidate.quarantined_at,
        candidateLastValidation: candidate.last_validation_result ?? null,
        candidateLastHealthCheckedAt: candidate.last_health_checked_at ?? null,
        gates: {
          network: 'PENDING', decode: 'PENDING', placeholder: 'PENDING',
          identity: 'PENDING', continuity: 'PENDING', desktop: 'PENDING', search: 'PENDING',
        },
      };
    }),
  };
  await mkdir(recoveryDir, { recursive: true });
  const output = join(recoveryDir, 'batch-001-manifest.json');
  await writeFile(output, JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ output, selected: manifest.records.map((row: { recordId: unknown; canonicalChannelName: unknown; candidateRecordId: unknown; candidateTitle: unknown }) => ({
    recordId: row.recordId, name: row.canonicalChannelName,
    candidateRecordId: row.candidateRecordId, candidateTitle: row.candidateTitle,
  })) }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
