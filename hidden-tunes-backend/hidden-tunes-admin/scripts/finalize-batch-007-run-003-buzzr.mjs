import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const restoration = path.join(root, 'data/tv-recovery/placeholder-audit/restoration');
const statePath = path.join(root, 'data/tv-recovery/placeholder-audit/intensive-recovery/state.json');
const proofDir = path.join(restoration, 'buzzr-proof');
const report = JSON.parse(fs.readFileSync(path.join(proofDir, 'metrics.json'), 'utf8'));
const playback = report.metrics;
if (!report.pass || playback.videoElementCount !== 1 || playback.advancedSeconds < 115 || playback.fatal.length) throw new Error('BUZZR Desktop proof gate failed');

const candidateRecordId = '85355b3f-9a8f-4fd8-9b66-88eef9b12acc';
const at = new Date().toISOString();
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const aliases = state.entries.filter((entry) => entry.alternativeRecordId === candidateRecordId && /buzzr/i.test(entry.title));
if (aliases.length !== 2) throw new Error(`Expected 2 BUZZR aliases, found ${aliases.length}`);
for (const entry of aliases) {
  entry.recoveryState = 'VERIFIED_DUPLICATE_MERGED';
  entry.attempts ??= [];
  entry.attempts.push({
    at,
    method: 'FULL_RESTORE_SEARCH_DESKTOP_PROOF',
    result: 'VERIFIED_DUPLICATE_MERGED',
    candidateRecordId,
    authoritativeProvenance: 'OFFICIAL_TUBI_FAST_DISTRIBUTION',
    identityConfidence: 'HIGH',
    identityEvidence: 'Official Tubi BUZZR service carrying continuous classic game-show programming characteristic of the exact network',
    continuitySeconds: Number(playback.advancedSeconds.toFixed(2)),
    desktopRuntime: 'PASS_1080P_ONE_VIDEO_OWNER_D_DRIVE_ONLY',
    productionSearch: 'PASS',
    productionResolver: 'PASS'
  });
}
state.updatedAt = at;
fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');

fs.writeFileSync(path.join(proofDir, 'final.json'), JSON.stringify({
  completedAt: at,
  identity: 'BUZZR', candidateRecordId, aliasesTerminal: aliases.length,
  authoritativeProvenance: 'Official Tubi FAST distribution',
  content: 'Real moving classic game-show programming', identityConfidence: 'HIGH',
  desktopPlaybackSeconds: Number(playback.advancedSeconds.toFixed(2)),
  resolution: `${playback.width}x${playback.height}`, videoElementCount: playback.videoElementCount,
  productionSearch: 'PASS', productionResolver: 'PASS', result: 'VERIFIED_DUPLICATE_MERGED',
  productionWrites: 0, duplicatesCreated: 0
}, null, 2) + '\n');

fs.writeFileSync(path.join(restoration, 'batch-007-run-003.json'), JSON.stringify({
  completedAt: at,
  scope: 'Batch 7 provenance-first bounded retest investigation',
  identitiesResearched: 5, authoritativeCandidatesFound: 3, sourcesTested: 1, decoded: 1,
  continuityPassed: 1, desktopVerified: 1, exactHighIdentityPassed: 1, searchVerified: 1,
  resolverVerified: 1, restored: 0, verifiedDuplicatesMerged: 1, productionWrites: 0,
  notes: [
    'BUZZR candidate uses official Tubi FAST distribution and passed 119.99 seconds of 1920x1080 Desktop playback with one video owner and no fatal HLS errors.',
    'Sampled frames showed continuous classic game-show programming characteristic of BUZZR; official exact-title distribution supports HIGH identity. Normal search and resolver passed.',
    'Two quarantined aliases remain hidden and are terminal VERIFIED_DUPLICATE_MERGED locally. No production write or duplicate was needed.',
    'Anime X HIDIVE and On The Case were rejected before testing because they use jmp2.uk and i.mjh.nz. ABC News Live remains an official Tubi candidate; Nash Bridges retains Xumo-linked provenance for a later bounded run.'
  ],
  cumulativeVerifiedSearchableDesktopPlayableIdentities: 22,
  cumulativeTerminalAliases: 99,
  batch7Target: 25, batch7Researched: 15, batch7Remaining: 10
}, null, 2) + '\n');

console.log(JSON.stringify({ aliasesTerminal: aliases.length, checkpoint: 'batch-007-run-003.json', totals: { identities: 22, aliases: 99 } }, null, 2));
