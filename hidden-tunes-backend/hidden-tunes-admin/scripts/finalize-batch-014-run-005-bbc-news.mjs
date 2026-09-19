import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const restoration = path.join(root, 'data/tv-recovery/placeholder-audit/restoration');
const statePath = path.join(root, 'data/tv-recovery/placeholder-audit/intensive-recovery/state.json');
const proofDir = path.join(restoration, 'batch-014-run-005-bbc-news-proof');
const metrics = JSON.parse(fs.readFileSync(path.join(proofDir, 'metrics.json'), 'utf8'));
const playback = metrics.metrics;
if (!metrics.pass || playback.videoElementCount !== 1 || playback.advancedSeconds < 120 || playback.fatal.length) throw new Error('BBC News proof failed');

const candidateRecordId = 'e99be7ba-59c0-4570-bed2-5b2575cb701b';
const completedAt = new Date().toISOString();
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const aliases = state.entries.filter((entry) => entry.alternativeRecordId === candidateRecordId && /^BBC News$/i.test(entry.title));
if (aliases.length !== 1) throw new Error(`Unexpected alias count: ${aliases.length}`);

for (const entry of aliases) {
  entry.recoveryState = 'VERIFIED_DUPLICATE_MERGED';
  entry.attempts ??= [];
  entry.attempts.push({
    at: completedAt,
    method: 'FULL_RESTORE_SEARCH_DESKTOP_PROOF',
    result: 'VERIFIED_DUPLICATE_MERGED',
    candidateRecordId,
    authoritativeProvenance: 'BBC_OFFICIAL_WORLDWIDE_AKAMAI_LIVE_FEED',
    identityConfidence: 'EXACT',
    identityEvidence: 'BBC documents its BBC News live channel; the candidate uses the BBC worldwide live Akamai delivery family and continuous frames carried explicit BBC News branding, ticker, and programme graphics.',
    continuitySeconds: Number(playback.advancedSeconds.toFixed(2)),
    desktopRuntime: 'PASS_540P_ONE_VIDEO_OWNER_D_DRIVE_ONLY',
    productionSearch: 'PASS',
    productionResolver: 'PASS',
  });
}

state.updatedAt = completedAt;
fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
fs.writeFileSync(path.join(proofDir, 'final.json'), `${JSON.stringify({
  completedAt, identity: 'BBC News', candidateRecordId, aliasesTerminal: aliases.length,
  identityConfidence: 'EXACT', desktopPlaybackSeconds: Number(playback.advancedSeconds.toFixed(2)),
  resolution: `${playback.width}x${playback.height}`, productionSearch: 'PASS', productionResolver: 'PASS',
  result: 'VERIFIED_DUPLICATE_MERGED', productionWrites: 0, duplicatesCreated: 0,
}, null, 2)}\n`);
fs.writeFileSync(path.join(restoration, 'batch-014-run-005.json'), `${JSON.stringify({
  completedAt, scope: 'Batch 14 identity-review bounded investigation', identitiesResearched: 5,
  authoritativeCandidatesFound: 3, sourcesTested: 1, decoded: 1, placeholderRejected: 0,
  wrongChannelRejected: 0, identityUnresolved: 2, continuityPassed: 1, desktopVerified: 1,
  exactHighIdentityPassed: 1, searchVerified: 1, resolverVerified: 1, restored: 0,
  verifiedDuplicatesMerged: 1, productionWrites: 0,
  notes: [
    'BBC News passed 124.04 seconds of 960x540 existing-Desktop playback with one video owner through its worldwide Akamai live feed.',
    'Continuous evidence carried explicit BBC News branding, ticker, and programme graphics; normal Hidden Tunes search and resolver passed.',
    'One quarantined alias is terminal VERIFIED_DUPLICATE_MERGED. No production write or duplicate was needed.',
    'Pluto TV Sport used an uncertain third-party source, True Crime Now used jmp2.uk, and Qello Concerts and Criminal Confessions lacked complete exact candidate ownership linkage.',
  ],
  cumulativeVerifiedSearchableDesktopPlayableIdentities: 41, cumulativeTerminalAliases: 146,
  batch14Target: 25, batch14Researched: 25, batch14Remaining: 0, batch14Complete: true,
}, null, 2)}\n`);
console.log(JSON.stringify({ aliasesTerminal: aliases.length, totals: { identities: 41, aliases: 146 } }, null, 2));
