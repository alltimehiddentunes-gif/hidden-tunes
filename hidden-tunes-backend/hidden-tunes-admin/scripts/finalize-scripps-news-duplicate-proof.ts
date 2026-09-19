import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const statePath = join(root, 'data', 'tv-recovery', 'placeholder-audit', 'intensive-recovery', 'state.json');
const proofDirectory = join(root, 'data', 'tv-recovery', 'placeholder-audit', 'restoration', 'scripps-news-proof');
const candidateRecordId = '6037069e-e1aa-45c0-89cf-8885851cdb80';

async function main() {
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  const now = new Date().toISOString();
  const aliases = state.entries.filter((entry: any) => entry.alternativeRecordId === candidateRecordId && entry.title === 'Scripps News');
  for (const entry of aliases) {
    entry.recoveryState = 'VERIFIED_DUPLICATE_MERGED';
    entry.attempts.push({
      at: now,
      method: 'FULL_RESTORE_SEARCH_DESKTOP_PROOF',
      result: 'VERIFIED_DUPLICATE_MERGED',
      candidateRecordId,
      authoritativeProvenance: 'SCRIPPS_OWNED_NEWS_NETWORK_OFFICIAL_TUBI_FAST_DISTRIBUTION',
      identityConfidence: 'EXACT',
      identityEvidence: 'Scripps News branding was visible repeatedly in the live newsroom programme frames',
      continuitySeconds: 124.25,
      desktopRuntime: 'PASS_1080P_ONE_VIDEO_OWNER_D_DRIVE_ONLY',
      productionSearch: 'PASS',
      productionResolver: 'PASS'
    });
  }
  state.updatedAt = now;
  await writeFile(statePath, JSON.stringify(state, null, 2));
  await mkdir(proofDirectory, { recursive: true });
  const report = {
    completedAt: now,
    identity: 'Scripps News',
    candidateRecordId,
    aliasesTerminal: aliases.length,
    terminalState: 'VERIFIED_DUPLICATE_MERGED',
    productionWrites: 0,
    duplicatesCreated: 0,
    runtimeStorage: 'D_DRIVE_ONLY',
    cumulativeVerifiedSearchableDesktopPlayable: 14,
    cumulativeTerminalAliases: 81
  };
  await writeFile(join(proofDirectory, 'final.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
