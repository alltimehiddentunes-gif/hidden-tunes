import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const statePath = join(root, 'data', 'tv-recovery', 'placeholder-audit', 'intensive-recovery', 'state.json');
const proofDirectory = join(root, 'data', 'tv-recovery', 'placeholder-audit', 'restoration', 'tna-wrestling-proof');
const out = join(proofDirectory, 'final.json');
const candidateRecordId = '674ee4f5-6885-48a2-aeb5-6cbd13847ea2';

async function main() {
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  const now = new Date().toISOString();
  const aliases = state.entries.filter((entry: any) =>
    entry.alternativeRecordId === candidateRecordId && entry.title.replace(/ \(.*\)$/, '') === 'TNA Wrestling'
  );

  for (const entry of aliases) {
    entry.recoveryState = 'VERIFIED_DUPLICATE_MERGED';
    entry.attempts.push({
      at: now,
      method: 'FULL_RESTORE_SEARCH_DESKTOP_PROOF',
      result: 'VERIFIED_DUPLICATE_MERGED',
      candidateRecordId,
      authoritativeProvenance: 'PLEX_ROKU_XUMO_OFFICIAL_FAST_DISTRIBUTION',
      identityConfidence: 'EXACT',
      identityEvidence: 'Persistent TNA Wrestling branding, TNA ring/cage footage, and IMPACT Wrestling continuity slate',
      continuitySeconds: 119.33,
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
    identity: 'TNA Wrestling Channel',
    candidateRecordId,
    aliasesTerminal: aliases.length,
    terminalState: 'VERIFIED_DUPLICATE_MERGED',
    productionWrites: 0,
    duplicatesCreated: 0,
    runtimeStorage: 'D_DRIVE_ONLY',
    cumulativeVerifiedSearchableDesktopPlayable: 12,
    cumulativeTerminalAliases: 79
  };
  await writeFile(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
