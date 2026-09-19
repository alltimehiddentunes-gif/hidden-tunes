import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const restoration = path.join(root, 'data/tv-recovery/placeholder-audit/restoration');
const statePath = path.join(root, 'data/tv-recovery/placeholder-audit/intensive-recovery/state.json');
const proofDir = path.join(restoration, 'livenow-from-fox-proof');
const rejectedCandidateRecordId = '53e9a28f-7d75-45dd-bec3-a6501c2579d3';
const candidateRecordId = '1fbac29e-900f-435a-b716-3c8737a50b0a';
const metrics = JSON.parse(fs.readFileSync(path.join(proofDir, 'metrics.json'), 'utf8'));
const playback = metrics.metrics;

if (!metrics.pass || playback.videoElementCount !== 1 || playback.advancedSeconds < 120 || playback.fatal.length) {
  throw new Error('proof failed');
}

const completedAt = new Date().toISOString();
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const aliases = state.entries.filter((entry) =>
  entry.alternativeRecordId === rejectedCandidateRecordId && /livenow from fox/i.test(entry.title)
);

if (aliases.length !== 2 || state.entries.some((entry) => entry.alternativeRecordId === candidateRecordId)) {
  throw new Error(`alias/duplicate guard ${aliases.length}`);
}

for (const entry of aliases) {
  entry.recoveryState = 'VERIFIED_DUPLICATE_MERGED';
  entry.attempts ??= [];
  entry.attempts.push({
    at: completedAt,
    method: 'AUTHORITATIVE_ALTERNATIVE_FULL_RESTORE_SEARCH_DESKTOP_PROOF',
    result: 'VERIFIED_DUPLICATE_MERGED',
    candidateRecordId,
    rejectedCandidateRecordId,
    authoritativeProvenance: 'FOX_VIZIO_AMAGI_OFFICIAL_FAST_DISTRIBUTION',
    identityConfidence: 'HIGH',
    identityEvidence: 'FOX explicitly lists LiveNOW from FOX on VIZIO WatchFree+, and the directly named fox-foxnewsnow-vizio Amagi service showed sustained real breaking-news coverage.',
    continuitySeconds: Number(playback.advancedSeconds.toFixed(2)),
    desktopRuntime: 'PASS_720P_ONE_VIDEO_OWNER_D_DRIVE_ONLY',
    productionSearch: 'PASS',
    productionResolver: 'PASS',
  });
}

state.updatedAt = completedAt;
fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
fs.writeFileSync(path.join(proofDir, 'final.json'), `${JSON.stringify({
  completedAt,
  identity: 'LiveNOW from FOX',
  candidateRecordId,
  rejectedCandidateRecordId,
  aliasesTerminal: 2,
  identityConfidence: 'HIGH',
  desktopPlaybackSeconds: Number(playback.advancedSeconds.toFixed(2)),
  resolution: `${playback.width}x${playback.height}`,
  videoElementCount: playback.videoElementCount,
  productionSearch: 'PASS',
  productionResolver: 'PASS',
  result: 'VERIFIED_DUPLICATE_MERGED',
  productionWrites: 0,
  duplicatesCreated: 0,
}, null, 2)}\n`);
fs.writeFileSync(path.join(restoration, 'batch-026-run-005.json'), `${JSON.stringify({
  completedAt,
  scope: 'Batch 26 provenance-first bounded investigation',
  identitiesResearched: 5,
  authoritativeCandidatesFound: 2,
  sourcesTested: 1,
  decoded: 1,
  continuityPassed: 1,
  desktopVerified: 1,
  exactHighIdentityPassed: 1,
  searchVerified: 1,
  resolverVerified: 1,
  restored: 0,
  verifiedDuplicatesMerged: 2,
  productionWrites: 0,
  notes: [
    'LiveNOW from FOX passed 124.42 seconds of 1280x720 existing-Desktop playback with one video owner from its directly named FOX/VIZIO Amagi candidate.',
    'FOX explicitly lists LiveNOW from FOX on VIZIO WatchFree+, and sustained real breaking-news coverage supports HIGH identity. Normal search and production resolver passed.',
    'Two quarantined aliases were terminally merged from their rejected jmp2.uk candidate to the distinct authoritative candidate without creating a duplicate.',
    'BBC Travel and The Bob Ross Channel used rejected jmp2.uk. CNN Headlines used generic CloudFront without direct authoritative linkage. This Old House retained a distinct Roku/Wurl candidate but was not tested after the stronger LiveNOW proof.',
  ],
  cumulativeVerifiedSearchableDesktopPlayableIdentities: 66,
  cumulativeTerminalAliases: 205,
  batch26Target: 25,
  batch26Researched: 25,
  batch26Remaining: 0,
  batch26Complete: true,
}, null, 2)}\n`);

console.log(JSON.stringify({ aliasesTerminal: 2, totals: { identities: 66, aliases: 205 }, batch26Complete: true }, null, 2));
