import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const restoration = path.join(root, 'data/tv-recovery/placeholder-audit/restoration');
const statePath = path.join(root, 'data/tv-recovery/placeholder-audit/intensive-recovery/state.json');
const proofDir = path.join(restoration, 'bbc-earth-proof');
const candidateRecordId = '7c63bf39-9710-432d-9dd1-661af4ecd27c';
const metrics = JSON.parse(fs.readFileSync(path.join(proofDir, 'metrics.json'), 'utf8'));
const p = metrics.metrics;
if (!metrics.pass || p.videoElementCount !== 1 || p.advancedSeconds < 120 || p.fatal.length) throw new Error('proof failed');

const completedAt = new Date().toISOString();
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const aliases = state.entries.filter((entry) => entry.alternativeRecordId === candidateRecordId && /^BBC Earth$/i.test(entry.title));
if (aliases.length !== 1) throw new Error(`aliases ${aliases.length}`);
for (const entry of aliases) {
  entry.recoveryState = 'VERIFIED_DUPLICATE_MERGED';
  entry.attempts ??= [];
  entry.attempts.push({
    at: completedAt,
    method: 'FULL_RESTORE_SEARCH_DESKTOP_PROOF',
    result: 'VERIFIED_DUPLICATE_MERGED',
    candidateRecordId,
    authoritativeProvenance: 'BBC_STUDIOS_XUMO_OFFICIAL_FAST_DISTRIBUTION',
    identityConfidence: 'HIGH',
    identityEvidence: 'BBC Studios confirms BBC Earth and its FAST portfolio; official Xumo channel lineups list BBC Earth, and the Xumo-namespaced Amagi service delivered continuous premium natural-history programming.',
    continuitySeconds: Number(p.advancedSeconds.toFixed(2)),
    desktopRuntime: 'PASS_1080P_ONE_VIDEO_OWNER_D_DRIVE_ONLY',
    productionSearch: 'PASS',
    productionResolver: 'PASS',
  });
}
state.updatedAt = completedAt;
fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
fs.writeFileSync(path.join(proofDir, 'final.json'), `${JSON.stringify({completedAt, identity:'BBC Earth', candidateRecordId, aliasesTerminal:1, identityConfidence:'HIGH', desktopPlaybackSeconds:Number(p.advancedSeconds.toFixed(2)), resolution:`${p.width}x${p.height}`, videoElementCount:p.videoElementCount, productionSearch:'PASS', productionResolver:'PASS', result:'VERIFIED_DUPLICATE_MERGED', productionWrites:0, duplicatesCreated:0}, null, 2)}\n`);
fs.writeFileSync(path.join(restoration, 'batch-020-run-005.json'), `${JSON.stringify({completedAt, scope:'Batch 20 final provenance-first bounded investigation', identitiesResearched:5, authoritativeCandidatesFound:1, sourcesTested:1, decoded:1, continuityPassed:1, desktopVerified:1, exactHighIdentityPassed:1, searchVerified:1, resolverVerified:1, restored:0, verifiedDuplicatesMerged:1, productionWrites:0, notes:['BBC Earth passed 124.43 seconds of 1920x1080 existing-Desktop playback with one video owner from the Xumo-namespaced Amagi service.','BBC Studios and official Xumo channel-lineup evidence establish BBC Earth FAST distribution; continuous premium natural-history programming supports HIGH identity. Search and resolver passed.','One quarantined alias is terminal VERIFIED_DUPLICATE_MERGED; no production write or duplicate was needed.','Pluto TV Star Trek, Radio-Canada INFO, and Pluto TV Movies used rejected jmp2.uk. Nickelodeon used an unverified ma.anixa.tv endpoint and was not validated.'], cumulativeVerifiedSearchableDesktopPlayableIdentities:50, cumulativeTerminalAliases:175, batch20Target:25, batch20Researched:25, batch20Remaining:0}, null, 2)}\n`);
fs.writeFileSync(path.join(restoration, 'batch-020-final.json'), `${JSON.stringify({completedAt, batch:20, identitiesResearched:25, newVerifiedSearchableDesktopPlayableIdentities:1, newTerminalAliases:1, verifiedIdentities:['BBC Earth'], cumulativeVerifiedSearchableDesktopPlayableIdentities:50, cumulativeTerminalAliases:175, productionWrites:0, duplicatesCreated:0, safetyRegressions:0, nextBatch:21}, null, 2)}\n`);
console.log(JSON.stringify({aliasesTerminal:1, totals:{identities:50, aliases:175}}, null, 2));
