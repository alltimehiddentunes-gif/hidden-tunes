import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const restoration = path.join(root, 'data/tv-recovery/placeholder-audit/restoration');
const statePath = path.join(root, 'data/tv-recovery/placeholder-audit/intensive-recovery/state.json');
const proofDir = path.join(restoration, 'batch-015-run-003-shop-lc-proof');
const proof = JSON.parse(fs.readFileSync(path.join(proofDir, 'metrics.json'), 'utf8'));
const playback = proof.metrics;
if (!proof.pass || playback.videoElementCount !== 1 || playback.advancedSeconds < 120 || playback.fatal.length) throw new Error('Shop LC proof failed');

const candidateRecordId = 'd01c046f-fd56-4803-831d-b912434b29ce';
const completedAt = new Date().toISOString();
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const aliases = state.entries.filter((entry) => entry.alternativeRecordId === candidateRecordId && /^Shop LC$/i.test(entry.title));
if (aliases.length !== 2) throw new Error(`Unexpected alias count: ${aliases.length}`);

for (const entry of aliases) {
  entry.recoveryState = 'VERIFIED_DUPLICATE_MERGED';
  entry.attempts ??= [];
  entry.attempts.push({
    at: completedAt,
    method: 'FULL_RESTORE_SEARCH_DESKTOP_PROOF',
    result: 'VERIFIED_DUPLICATE_MERGED',
    candidateRecordId,
    authoritativeProvenance: 'SHOP_LC_BRANDED_AKAMAI_OFFICIAL_LIVE_DISTRIBUTION',
    identityConfidence: 'HIGH',
    identityEvidence: 'Shop LC officially offers continuous live TV; its branded Akamai endpoint delivered continuous Shop LC shopping programming and product graphics consistent with the official live schedule.',
    continuitySeconds: Number(playback.advancedSeconds.toFixed(2)),
    desktopRuntime: 'PASS_1080P_ONE_VIDEO_OWNER_D_DRIVE_ONLY',
    productionSearch: 'PASS',
    productionResolver: 'PASS',
  });
}

state.updatedAt = completedAt;
fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
fs.writeFileSync(path.join(proofDir, 'final.json'), `${JSON.stringify({
  completedAt, identity: 'Shop LC', candidateRecordId, aliasesTerminal: aliases.length,
  identityConfidence: 'HIGH', desktopPlaybackSeconds: Number(playback.advancedSeconds.toFixed(2)),
  resolution: `${playback.width}x${playback.height}`, productionSearch: 'PASS', productionResolver: 'PASS',
  result: 'VERIFIED_DUPLICATE_MERGED', productionWrites: 0, duplicatesCreated: 0,
}, null, 2)}\n`);
fs.writeFileSync(path.join(restoration, 'batch-015-run-003.json'), `${JSON.stringify({
  completedAt, scope: 'Batch 15 identity-review bounded investigation', identitiesResearched: 5,
  authoritativeCandidatesFound: 1, sourcesTested: 1, decoded: 1, placeholderRejected: 0,
  wrongChannelRejected: 0, identityUnresolved: 2, continuityPassed: 1, desktopVerified: 1,
  exactHighIdentityPassed: 1, searchVerified: 1, resolverVerified: 1, restored: 0,
  verifiedDuplicatesMerged: 2, productionWrites: 0,
  notes: [
    'Shop LC passed 124.98 seconds of 1920x1080 existing-Desktop playback with one video owner from its branded Akamai distribution.',
    'Official Shop LC pages confirm live television distribution; continuous evidence showed real shopping programming and normal search/resolver passed.',
    'Two quarantined aliases are terminal VERIFIED_DUPLICATE_MERGED. No production write or duplicate was needed.',
    'MovieSphere and The Martha Stewart Channel used rejected jmp2.uk. 60 Minutes used an unverified mediator endpoint. Naruto used generic CloudFront without exact authoritative linkage.',
  ],
  cumulativeVerifiedSearchableDesktopPlayableIdentities: 43, cumulativeTerminalAliases: 149,
  batch15Target: 25, batch15Researched: 15, batch15Remaining: 10,
}, null, 2)}\n`);
console.log(JSON.stringify({ aliasesTerminal: aliases.length, totals: { identities: 43, aliases: 149 } }, null, 2));
