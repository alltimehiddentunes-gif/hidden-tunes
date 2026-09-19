import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const restoration = path.join(root, 'data/tv-recovery/placeholder-audit/restoration');
const statePath = path.join(root, 'data/tv-recovery/placeholder-audit/intensive-recovery/state.json');
const proofDir = path.join(restoration, 'kartoon-channel-proof');
const metrics = JSON.parse(fs.readFileSync(path.join(proofDir, 'metrics.json'), 'utf8'));
const playback = metrics.metrics;
if (!metrics.pass || playback.videoElementCount !== 1 || playback.advancedSeconds < 120 || playback.fatal.length) throw new Error('Kartoon Channel proof failed');

const candidateRecordId = 'f1c9b95c-ac1a-4a34-9cad-e14db87993ba';
const completedAt = new Date().toISOString();
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const aliases = state.entries.filter((entry) => entry.alternativeRecordId === candidateRecordId && /Kartoon Channel/i.test(entry.title));
if (aliases.length !== 1) throw new Error(`Unexpected alias count: ${aliases.length}`);

for (const entry of aliases) {
  entry.recoveryState = 'VERIFIED_DUPLICATE_MERGED';
  entry.attempts ??= [];
  entry.attempts.push({
    at: completedAt,
    method: 'FULL_RESTORE_SEARCH_DESKTOP_PROOF',
    result: 'VERIFIED_DUPLICATE_MERGED',
    candidateRecordId,
    authoritativeProvenance: 'SAMSUNG_AUSTRALIA_OFFICIAL_KARTOON_CHANNEL_AMAGI_FEED',
    identityConfidence: 'EXACT',
    identityEvidence: 'Samsung Australia lists Kartoon Channel 1915 and the candidate is its Samsung Australia Amagi feed; continuous frames showed Casper the Friendly Ghost, an exact Kartoon Channel title',
    continuitySeconds: Number(playback.advancedSeconds.toFixed(2)),
    desktopRuntime: 'PASS_1080P_ONE_VIDEO_OWNER_D_DRIVE_ONLY',
    productionSearch: 'PASS',
    productionResolver: 'PASS',
  });
}

state.updatedAt = completedAt;
fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
fs.writeFileSync(path.join(proofDir, 'final.json'), `${JSON.stringify({
  completedAt, identity: 'Kartoon Channel!', candidateRecordId, aliasesTerminal: aliases.length,
  identityConfidence: 'EXACT', desktopPlaybackSeconds: Number(playback.advancedSeconds.toFixed(2)),
  resolution: `${playback.width}x${playback.height}`, productionSearch: 'PASS', productionResolver: 'PASS',
  result: 'VERIFIED_DUPLICATE_MERGED', productionWrites: 0, duplicatesCreated: 0,
}, null, 2)}\n`);
fs.writeFileSync(path.join(restoration, 'batch-013-run-001.json'), `${JSON.stringify({
  completedAt, scope: 'Batch 13 identity-review bounded investigation', identitiesResearched: 5,
  authoritativeCandidatesFound: 3, sourcesTested: 1, decoded: 1, placeholderRejected: 0,
  wrongChannelRejected: 0, identityUnresolved: 2, continuityPassed: 1, desktopVerified: 1,
  exactHighIdentityPassed: 1, searchVerified: 1, resolverVerified: 1, restored: 0,
  verifiedDuplicatesMerged: 1, productionWrites: 0,
  notes: [
    'Kartoon Channel passed 124.38 seconds of 1920x1080 existing-Desktop playback with one video owner through its Samsung Australia Amagi feed.',
    'Samsung Australia lists Kartoon Channel 1915. Evidence showed continuous Casper the Friendly Ghost programming, which Kartoon Channel officially carries; normal search and resolver passed.',
    'One quarantined alias is terminal VERIFIED_DUPLICATE_MERGED. No production write or duplicate was needed.',
    'Radio-Canada INFO used jmp2.uk. Bloodline Detectives, All Reality We TV, and Oxygen True Crime Archives retained plausible distribution candidates but lacked complete exact source-to-identity proof in this run.',
  ],
  cumulativeVerifiedSearchableDesktopPlayableIdentities: 38, cumulativeTerminalAliases: 135,
  batch13Target: 25, batch13Researched: 5, batch13Remaining: 20,
}, null, 2)}\n`);
console.log(JSON.stringify({ aliasesTerminal: aliases.length, totals: { identities: 38, aliases: 135 } }, null, 2));
