import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const restoration = path.join(root, 'data/tv-recovery/placeholder-audit/restoration');
const statePath = path.join(root, 'data/tv-recovery/placeholder-audit/intensive-recovery/state.json');
const proofDir = path.join(restoration, 'abc-news-live-proof');
const report = JSON.parse(fs.readFileSync(path.join(proofDir, 'metrics-confirm.json'), 'utf8'));
const playback = report.metrics;
if (!report.pass || playback.videoElementCount !== 1 || playback.advancedSeconds < 120 || playback.fatal.length) throw new Error('ABC News Live Desktop proof gate failed');

const candidateRecordId = '8ee2d9b6-5211-4e9c-b223-a732f24b3ab3';
const at = new Date().toISOString();
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const aliases = state.entries.filter((entry) => entry.alternativeRecordId === candidateRecordId && /abc news live/i.test(entry.title));
if (aliases.length !== 2) throw new Error(`Expected 2 ABC News Live aliases, found ${aliases.length}`);
for (const entry of aliases) {
  entry.recoveryState = 'VERIFIED_DUPLICATE_MERGED';
  entry.attempts ??= [];
  entry.attempts.push({
    at, method: 'FULL_RESTORE_SEARCH_DESKTOP_PROOF', result: 'VERIFIED_DUPLICATE_MERGED', candidateRecordId,
    authoritativeProvenance: 'OFFICIAL_TUBI_FAST_DISTRIBUTION_WITH_ABC_OWNED_CANONICAL_MATCHES',
    identityConfidence: 'HIGH',
    identityEvidence: 'Continuous live breaking-news coverage on official Tubi distribution, corroborated by healthy ABC-owned exact canonical records',
    continuitySeconds: Number(playback.advancedSeconds.toFixed(2)),
    desktopRuntime: 'PASS_720P_ONE_VIDEO_OWNER_D_DRIVE_ONLY', productionSearch: 'PASS', productionResolver: 'PASS'
  });
}
state.updatedAt = at;
fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');

fs.writeFileSync(path.join(proofDir, 'final.json'), JSON.stringify({
  completedAt: at, identity: 'ABC News Live', candidateRecordId, aliasesTerminal: aliases.length,
  authoritativeProvenance: 'Official Tubi FAST distribution corroborated by ABC-owned exact canonical records',
  content: 'Real moving live breaking-news programme content', identityConfidence: 'HIGH',
  desktopPlaybackSeconds: Number(playback.advancedSeconds.toFixed(2)), resolution: `${playback.width}x${playback.height}`,
  videoElementCount: playback.videoElementCount, productionSearch: 'PASS', productionResolver: 'PASS',
  result: 'VERIFIED_DUPLICATE_MERGED', productionWrites: 0, duplicatesCreated: 0
}, null, 2) + '\n');

fs.writeFileSync(path.join(restoration, 'batch-007-run-004.json'), JSON.stringify({
  completedAt: at, scope: 'Batch 7 provenance-first bounded retest investigation',
  identitiesResearched: 5, authoritativeCandidatesFound: 3, sourcesTested: 1, decoded: 1,
  continuityPassed: 1, desktopVerified: 1, exactHighIdentityPassed: 1, searchVerified: 1,
  resolverVerified: 1, restored: 0, verifiedDuplicatesMerged: 1, productionWrites: 0,
  notes: [
    'ABC News Live passed a strict confirmation run with 124.65 seconds of 1280x720 Desktop playback, one video owner, and no fatal HLS errors.',
    'Official Tubi distribution carried continuous live breaking-news coverage and normal search exposed healthy ABC-owned exact canonical records, supporting HIGH identity. Resolver passed.',
    'Two quarantined aliases remain hidden and are terminal VERIFIED_DUPLICATE_MERGED locally. No production write or duplicate was needed.',
    'Runtime was rejected for jmp2.uk. Car Chase lacked sufficient broadcaster-specific provenance. Nash Bridges and Antiques Road Trip retain plausible official FAST delivery candidates for later proof.'
  ],
  cumulativeVerifiedSearchableDesktopPlayableIdentities: 23, cumulativeTerminalAliases: 101,
  batch7Target: 25, batch7Researched: 20, batch7Remaining: 5
}, null, 2) + '\n');

console.log(JSON.stringify({ aliasesTerminal: aliases.length, checkpoint: 'batch-007-run-004.json', totals: { identities: 23, aliases: 101 } }, null, 2));
