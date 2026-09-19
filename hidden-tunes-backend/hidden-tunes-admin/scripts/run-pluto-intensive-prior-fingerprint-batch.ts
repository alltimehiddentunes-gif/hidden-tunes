import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const base = join(root, 'data', 'tv-recovery', 'placeholder-audit');
const dir = join(base, 'intensive-recovery');

async function main() {
  await mkdir(dir, { recursive: true });
  const state = JSON.parse(await readFile(join(dir, 'state.json'), 'utf8'));
  const registry = JSON.parse(await readFile(join(root, 'data', 'tv-recovery', 'master-recovery-registry.json'), 'utf8'));
  const byProvider = new Map(registry.entries.map((entry: any) => [entry.providerChannelId, entry]));
  const pendingIds = [...new Set<string>(state.entries
    .filter((entry: any) => entry.recoveryState === 'PENDING')
    .map((entry: any) => entry.providerChannelId))];
  const ordered = pendingIds.map((id) => ({ id, prior: byProvider.get(id) as any }))
    .sort((a, b) => {
      const rank = (value?: string) => value === 'WRONG_SOURCE_REJECTED' ? 0 : value === 'IDENTITY_UNRESOLVED' ? 1 : 2;
      return rank(a.prior?.terminalStatus) - rank(b.prior?.terminalStatus);
    }).slice(0, 50);
  if (!ordered.length) throw new Error('No pending identities remain for prior-fingerprint staging');

  const startedAt = new Date().toISOString();
  const now = new Date().toISOString();
  const results = ordered.map(({ id, prior }) => {
    const priorStatus = prior?.terminalStatus ?? 'NO_PRIOR_REGISTRY_ENTRY';
    const classification = priorStatus === 'WRONG_SOURCE_REJECTED' ? 'WRONG_SOURCE_REJECTED' :
      priorStatus === 'IDENTITY_UNRESOLVED' ? 'IDENTITY_UNRESOLVED' : 'BROADCASTER_RESEARCH_REQUIRED';
    return {
      providerChannelId: id,
      canonicalName: prior?.canonicalName ?? state.entries.find((entry: any) => entry.providerChannelId === id)?.title,
      priorStatus,
      previouslyResearched: prior?.previouslyResearched === true,
      priorAttempts: prior?.attempts ?? 0,
      exactCatalogCandidates: prior?.researchEvidence?.exactCatalogCandidates ?? 0,
      classification,
    };
  });
  for (const entry of state.entries) {
    const result = results.find((item) => item.providerChannelId === entry.providerChannelId);
    if (!result) continue;
    entry.recoveryState = result.classification;
    entry.attempts.push({ at: now, method: 'PRIOR_RESEARCH_FINGERPRINT_TRIAGE', result: result.classification });
  }
  state.batch += 1;
  state.updatedAt = now;
  await writeFile(join(dir, 'state.json'), JSON.stringify(state, null, 2));
  const checkpoint = {
    batch: state.batch, lane: 'PRIOR_RESEARCH_FINGERPRINT_TRIAGE', startedAt, completedAt: now,
    processedIdentities: ordered.length,
    queueRowsClassified: state.entries.filter((entry: any) => results.some((result) => result.providerChannelId === entry.providerChannelId)).length,
    wrongSourceRejected: results.filter((item) => item.classification === 'WRONG_SOURCE_REJECTED').length,
    identityUnresolved: results.filter((item) => item.classification === 'IDENTITY_UNRESOLVED').length,
    broadcasterResearchRequired: results.filter((item) => item.classification === 'BROADCASTER_RESEARCH_REQUIRED').length,
    remainingPending: state.entries.filter((entry: any) => entry.recoveryState === 'PENDING').length,
    productionWrites: 0, results,
  };
  await writeFile(join(dir, `checkpoint-${String(state.batch).padStart(3, '0')}.json`), JSON.stringify(checkpoint, null, 2));
  await writeFile(join(dir, 'latest-checkpoint.json'), JSON.stringify(checkpoint, null, 2));
  console.log(JSON.stringify(checkpoint, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
