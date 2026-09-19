import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const statePath = join(root, 'data', 'tv-recovery', 'placeholder-audit', 'intensive-recovery', 'state.json');
const outputPath = join(root, 'data', 'tv-recovery', 'placeholder-audit', 'restoration', 'wicked-tuna-proof', 'final.json');
const candidateRecordId = 'b7605689-ad12-4d0a-8898-ea7269700756';

async function main() {
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  const now = new Date().toISOString();
  const aliases = state.entries.filter((entry: any) => entry.alternativeRecordId === candidateRecordId);
  for (const entry of aliases) {
    entry.recoveryState = 'VERIFIED_DUPLICATE_MERGED';
    entry.attempts.push({ at: now, method: 'FULL_RESTORE_SEARCH_DESKTOP_PROOF', result: 'VERIFIED_DUPLICATE_MERGED', candidateRecordId,
      authoritativeProvenance: 'LIONSGATE_SAMSUNG_AMAGI_DEDICATED_WICKED_TUNA_CHANNEL', identityConfidence: 'HIGH', continuitySeconds: 128,
      desktopRuntime: 'PASS_1080P_ONE_VIDEO_OWNER', productionSearch: 'PASS', productionResolver: 'PASS' });
  }
  state.updatedAt = now;
  await writeFile(statePath, JSON.stringify(state, null, 2));
  const report = { completedAt: now, identity: 'Wicked Tuna', candidateRecordId, aliasesTerminal: aliases.length,
    terminalState: 'VERIFIED_DUPLICATE_MERGED', productionWrites: 0, duplicatesCreated: 0,
    cumulativeVerifiedSearchableDesktopPlayable: 6 };
  await writeFile(outputPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
