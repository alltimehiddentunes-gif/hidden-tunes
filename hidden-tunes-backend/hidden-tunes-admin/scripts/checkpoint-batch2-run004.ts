import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const statePath = join(root, 'data', 'tv-recovery', 'placeholder-audit', 'intensive-recovery', 'state.json');
const outputPath = join(root, 'data', 'tv-recovery', 'placeholder-audit', 'restoration', 'batch-002-run-004.json');
const unresolved = [
  { id: 'bd76bef3-9bd3-4771-b0ba-dbc553a880e2', name: 'CBS News Miami', resolution: '720p' },
  { id: 'e3bc79e2-75a0-4b3b-87a1-5723e1275fe3', name: 'Euronews Spanish', resolution: '720p' },
  { id: '26a9fa3f-eec5-45e6-bd6b-88606fa714b4', name: 'CBS News Philadelphia', resolution: '1080p' },
];

async function main() {
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  const now = new Date().toISOString();
  for (const candidate of unresolved) {
    for (const entry of state.entries.filter((item: any) => item.alternativeRecordId === candidate.id)) {
      entry.attempts.push({
        at: now,
        method: 'DESKTOP_120S_IDENTITY_PROOF',
        result: 'IDENTITY_UNRESOLVED_KEEP_QUARANTINED',
        candidateRecordId: candidate.id,
        continuitySeconds: 120,
        desktopRuntime: `PASS_${candidate.resolution}_ONE_VIDEO_OWNER`,
        reason: 'Captured programme frame did not prove exact regional/language channel identity',
      });
    }
  }
  state.updatedAt = now;
  await writeFile(statePath, JSON.stringify(state, null, 2));
  const checkpoint = {
    completedAt: now,
    batch: 2,
    run: 4,
    identitiesResearched: 4,
    authoritativeCandidatesFound: 4,
    sourcesTested: 4,
    decoded: 4,
    continuityPassed: 4,
    desktopVerified: 4,
    identityUnresolved: 3,
    restored: 0,
    verifiedDuplicatesMerged: 3,
    searchVerified: 1,
    resolverVerified: 1,
    recoveredIdentity: 'Rally TV',
    cumulativeVerifiedSearchableDesktopPlayable: 5,
    productionWrites: 0,
    duplicatesCreated: 0,
  };
  await writeFile(outputPath, JSON.stringify(checkpoint, null, 2));
  console.log(JSON.stringify(checkpoint, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
