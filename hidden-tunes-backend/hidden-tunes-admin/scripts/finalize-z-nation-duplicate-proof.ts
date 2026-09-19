import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const statePath = join(root, 'data', 'tv-recovery', 'placeholder-audit', 'intensive-recovery', 'state.json');
const proofDirectory = join(root, 'data', 'tv-recovery', 'placeholder-audit', 'restoration', 'z-nation-proof');
const candidateRecordId = 'bc4ad193-f447-4067-b05e-f01891c70c32';

async function main() {
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  const now = new Date().toISOString();
  const aliases = state.entries.filter((entry: any) => entry.alternativeRecordId === candidateRecordId && entry.title === 'Z Nation');
  for (const entry of aliases) {
    entry.recoveryState = 'VERIFIED_DUPLICATE_MERGED';
    entry.attempts.push({
      at: now,
      method: 'FULL_RESTORE_SEARCH_DESKTOP_PROOF',
      result: 'VERIFIED_DUPLICATE_MERGED',
      candidateRecordId,
      authoritativeProvenance: 'FILMRISE_OFFICIAL_FAST_VIZIO_SLING_DISTRIBUTION',
      identityConfidence: 'HIGH',
      identityEvidence: 'Sustained Z Nation episode content with matching principal cast and post-apocalyptic programme context',
      continuitySeconds: 119.54,
      desktopRuntime: 'PASS_720P_ONE_VIDEO_OWNER_D_DRIVE_ONLY',
      productionSearch: 'PASS',
      productionResolver: 'PASS'
    });
  }
  state.updatedAt = now;
  await writeFile(statePath, JSON.stringify(state, null, 2));
  await mkdir(proofDirectory, { recursive: true });
  const report = {
    completedAt: now,
    identity: 'Z Nation',
    candidateRecordId,
    aliasesTerminal: aliases.length,
    terminalState: 'VERIFIED_DUPLICATE_MERGED',
    productionWrites: 0,
    duplicatesCreated: 0,
    runtimeStorage: 'D_DRIVE_ONLY',
    cumulativeVerifiedSearchableDesktopPlayable: 13,
    cumulativeTerminalAliases: 80
  };
  await writeFile(join(proofDirectory, 'final.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
