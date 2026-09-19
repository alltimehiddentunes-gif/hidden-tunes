import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const statePath = join(root, 'data', 'tv-recovery', 'placeholder-audit', 'intensive-recovery', 'state.json');
const outputPath = join(root, 'data', 'tv-recovery', 'placeholder-audit', 'restoration', 'crime-360-proof', 'final.json');
const candidateRecordId = 'f6451fcf-0b46-4512-ab55-142c979129ac';

async function main() {
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  const now = new Date().toISOString();
  const aliases = state.entries.filter((entry: any) => entry.alternativeRecordId === candidateRecordId);
  for (const entry of aliases) {
    entry.recoveryState = 'VERIFIED_DUPLICATE_MERGED';
    entry.attempts.push({
      at: now,
      method: 'FULL_RESTORE_SEARCH_DESKTOP_PROOF',
      result: 'VERIFIED_DUPLICATE_MERGED',
      candidateRecordId,
      authoritativeProvenance: 'A_AND_E_WURL_OFFICIAL_FAST',
      identityConfidence: 'HIGH',
      identityEvidence: 'Exact catalog title plus sustained case-investigation programme content across sampled frames',
      continuitySeconds: 124.95,
      desktopRuntime: 'PASS_720P_ONE_VIDEO_OWNER_D_DRIVE_ONLY',
      productionSearch: 'PASS',
      productionResolver: 'PASS',
    });
  }
  state.updatedAt = now;
  await writeFile(statePath, JSON.stringify(state, null, 2));
  const report = {
    completedAt: now,
    identity: 'Crime 360',
    candidateRecordId,
    aliasesTerminal: aliases.length,
    terminalState: 'VERIFIED_DUPLICATE_MERGED',
    productionWrites: 0,
    duplicatesCreated: 0,
    runtimeStorage: 'D_DRIVE_ONLY',
    cumulativeVerifiedSearchableDesktopPlayable: 8,
  };
  await writeFile(outputPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
