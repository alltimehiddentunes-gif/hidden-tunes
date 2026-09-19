import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const restoration = path.join(root, 'data/tv-recovery/placeholder-audit/restoration');
const statePath = path.join(root, 'data/tv-recovery/placeholder-audit/intensive-recovery/state.json');
const proofDir = path.join(restoration, 'batch-015-run-001-construcciones-asombrosas-proof');
const metrics = JSON.parse(fs.readFileSync(path.join(proofDir, 'metrics.json'), 'utf8'));
const playback = metrics.metrics;
if (!metrics.pass || playback.videoElementCount !== 1 || playback.advancedSeconds < 120 || playback.fatal.length) throw new Error('Construcciones Asombrosas proof failed');

const candidateRecordId = '06639ff2-2405-4a09-90e9-5d577dc6fb64';
const completedAt = new Date().toISOString();
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const aliases = state.entries.filter((entry) => entry.alternativeRecordId === candidateRecordId && /^Construcciones Asombrosas$/i.test(entry.title));
if (aliases.length !== 1) throw new Error(`Unexpected alias count: ${aliases.length}`);

for (const entry of aliases) {
  entry.recoveryState = 'VERIFIED_DUPLICATE_MERGED';
  entry.attempts ??= [];
  entry.attempts.push({
    at: completedAt,
    method: 'FULL_RESTORE_SEARCH_DESKTOP_PROOF',
    result: 'VERIFIED_DUPLICATE_MERGED',
    candidateRecordId,
    authoritativeProvenance: 'WARNER_BROS_DISCOVERY_LOCAL_NOW_OFFICIAL_FAST_DISTRIBUTION',
    identityConfidence: 'HIGH',
    identityEvidence: 'Local Now officially launched the Warner Bros. Discovery Construcciones Asombrosas FAST channel; the candidate is delivered by Local Now and continuous frames showed real construction programme content.',
    continuitySeconds: Number(playback.advancedSeconds.toFixed(2)),
    desktopRuntime: 'PASS_1080P_ONE_VIDEO_OWNER_D_DRIVE_ONLY',
    productionSearch: 'PASS',
    productionResolver: 'PASS',
  });
}

state.updatedAt = completedAt;
fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
fs.writeFileSync(path.join(proofDir, 'final.json'), `${JSON.stringify({
  completedAt, identity: 'Construcciones Asombrosas', candidateRecordId, aliasesTerminal: aliases.length,
  identityConfidence: 'HIGH', desktopPlaybackSeconds: Number(playback.advancedSeconds.toFixed(2)),
  resolution: `${playback.width}x${playback.height}`, productionSearch: 'PASS', productionResolver: 'PASS',
  result: 'VERIFIED_DUPLICATE_MERGED', productionWrites: 0, duplicatesCreated: 0,
}, null, 2)}\n`);
fs.writeFileSync(path.join(restoration, 'batch-015-run-001.json'), `${JSON.stringify({
  completedAt, scope: 'Batch 15 identity-review bounded investigation', identitiesResearched: 5,
  authoritativeCandidatesFound: 2, sourcesTested: 1, decoded: 1, placeholderRejected: 0,
  wrongChannelRejected: 0, identityUnresolved: 1, continuityPassed: 1, desktopVerified: 1,
  exactHighIdentityPassed: 1, searchVerified: 1, resolverVerified: 1, restored: 0,
  verifiedDuplicatesMerged: 1, productionWrites: 0,
  notes: [
    'Construcciones Asombrosas passed 122.54 seconds of 1920x1080 existing-Desktop playback with one video owner through Local Now.',
    'Local Now officially launched the Warner Bros. Discovery channel, and continuous evidence showed real construction programming; normal Hidden Tunes search and resolver passed.',
    'One quarantined alias is terminal VERIFIED_DUPLICATE_MERGED. No production write or duplicate was needed.',
    'Pluto TV Science and Metal.Rocks used rejected jmp2.uk, Nick Jr. Club used rejected i.mjh.nz, and Vidas Extremas was not full-tested after the stronger exact Local Now candidate passed.',
  ],
  cumulativeVerifiedSearchableDesktopPlayableIdentities: 42, cumulativeTerminalAliases: 147,
  batch15Target: 25, batch15Researched: 5, batch15Remaining: 20,
}, null, 2)}\n`);
console.log(JSON.stringify({ aliasesTerminal: aliases.length, totals: { identities: 42, aliases: 147 } }, null, 2));
