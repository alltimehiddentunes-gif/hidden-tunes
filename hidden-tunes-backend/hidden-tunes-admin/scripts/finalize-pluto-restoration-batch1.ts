import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const intensiveDir = join(root, 'data', 'tv-recovery', 'placeholder-audit', 'intensive-recovery');
const restorationDir = join(root, 'data', 'tv-recovery', 'placeholder-audit', 'restoration');

async function main() {
  const validation = JSON.parse(await readFile(join(restorationDir, 'batch-001-technical-validation.json'), 'utf8'));
  const state = JSON.parse(await readFile(join(intensiveDir, 'state.json'), 'utf8'));
  const now = new Date().toISOString();
  for (const result of validation.results) {
    const entry = state.entries.find((item: any) => item.recordId === result.recordId);
    if (!entry) throw new Error(`State entry missing: ${result.recordId}`);
    const outcome = result.placeholderDetected ? 'PLACEHOLDER_BLOCKED' : 'CANDIDATE_NETWORK_FAIL';
    entry.recoveryState = outcome;
    entry.attempts.push({
      at: now,
      method: 'RESTORATION_BATCH_001_REAL_MEDIA_VALIDATION',
      result: outcome,
      candidateRecordId: result.candidateRecordId,
      framesDecoded: result.framesDecoded,
      continuityTargetSeconds: result.continuityTargetSeconds,
      continuityPass: result.continuityPass,
      placeholderDetected: result.placeholderDetected,
    });
  }
  state.updatedAt = now;
  await writeFile(join(intensiveDir, 'state.json'), JSON.stringify(state, null, 2));
  const checkpoint = {
    batch: 1,
    phase: 'RESTORATION_SEARCH_PROOF',
    completedAt: now,
    startingCandidates: 10,
    actualSourcesTested: 10,
    decoded: validation.results.filter((row: any) => row.framesDecoded > 0).length,
    networkPass: validation.networkPass,
    placeholderRejected: validation.placeholderDetected,
    endOfAvailability: 0,
    wrongChannelRejected: 0,
    identityUncertain: 0,
    deadOrNetworkFail: validation.results.filter((row: any) => !row.networkPass).length,
    unknown: 0,
    verifiedPlayable: 0,
    restoredToPublic: 0,
    restoredToSearch: 0,
    desktopPlaybackVerified: 0,
    searchResultsVerified: 0,
    failedRecordsKeptQuarantined: 10,
    duplicatesCreated: 0,
    nonPlutoRecordsAffected: 0,
    productionRecordsChanged: 0,
    productionWrites: 0,
    canBatch2Begin: false,
    stopReason: 'RESTORE_SEARCH_PLAYBACK_PATH_NOT_PROVEN_ZERO_VALID_SURVIVORS',
    results: validation.results.map((row: any) => ({
      recordId: row.recordId,
      canonicalChannelName: row.canonicalChannelName,
      candidateRecordId: row.candidateRecordId,
      classification: row.placeholderDetected ? 'PLACEHOLDER_BLOCKED' : 'CANDIDATE_NETWORK_FAIL',
      keptQuarantined: true,
    })),
  };
  await writeFile(join(restorationDir, 'checkpoint-001.json'), JSON.stringify(checkpoint, null, 2));
  await writeFile(join(restorationDir, 'latest-checkpoint.json'), JSON.stringify(checkpoint, null, 2));
  console.log(JSON.stringify(checkpoint, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
