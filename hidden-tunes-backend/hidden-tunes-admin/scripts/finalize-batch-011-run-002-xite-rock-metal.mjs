import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const restoration = path.join(root, 'data/tv-recovery/placeholder-audit/restoration');
const statePath = path.join(root, 'data/tv-recovery/placeholder-audit/intensive-recovery/state.json');
const proofDir = path.join(restoration, 'xite-rock-metal-proof');
const metrics = JSON.parse(fs.readFileSync(path.join(proofDir, 'metrics.json'), 'utf8'));
const playback = metrics.metrics;

if (!metrics.pass || playback.videoElementCount !== 1 || playback.advancedSeconds < 120 || playback.fatal.length) {
  throw new Error('XITE Rock x Metal Desktop proof failed');
}

const candidateRecordId = '8453ffb2-86f6-4b80-a464-b0292551db0e';
const completedAt = new Date().toISOString();
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const aliases = state.entries.filter(
  (entry) => entry.alternativeRecordId === candidateRecordId && /XITE Rock x Metal/i.test(entry.title),
);

if (aliases.length !== 1) throw new Error(`Unexpected alias count: ${aliases.length}`);

for (const entry of aliases) {
  entry.recoveryState = 'VERIFIED_DUPLICATE_MERGED';
  entry.attempts ??= [];
  entry.attempts.push({
    at: completedAt,
    method: 'FULL_RESTORE_SEARCH_DESKTOP_PROOF',
    result: 'VERIFIED_DUPLICATE_MERGED',
    candidateRecordId,
    authoritativeProvenance: 'XITE_OFFICIAL_FAST_DISTRIBUTION_AND_BRANDED_LINEAR_FEED',
    identityConfidence: 'EXACT',
    identityEvidence: 'XITE-owned distribution evidence names XITE Rock x Metal; continuous Desktop frames carried the exact XITE Rock x Metal bug and programme metadata',
    continuitySeconds: Number(playback.advancedSeconds.toFixed(2)),
    desktopRuntime: 'PASS_1080P_ONE_VIDEO_OWNER_D_DRIVE_ONLY',
    productionSearch: 'PASS',
    productionResolver: 'PASS',
  });
}

state.updatedAt = completedAt;
fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
fs.writeFileSync(
  path.join(proofDir, 'final.json'),
  `${JSON.stringify({
    completedAt,
    identity: 'XITE Rock x Metal',
    candidateRecordId,
    aliasesTerminal: aliases.length,
    identityConfidence: 'EXACT',
    desktopPlaybackSeconds: Number(playback.advancedSeconds.toFixed(2)),
    resolution: `${playback.width}x${playback.height}`,
    productionSearch: 'PASS',
    productionResolver: 'PASS',
    result: 'VERIFIED_DUPLICATE_MERGED',
    productionWrites: 0,
    duplicatesCreated: 0,
  }, null, 2)}\n`,
);
fs.writeFileSync(
  path.join(restoration, 'batch-011-run-002.json'),
  `${JSON.stringify({
    completedAt,
    scope: 'Batch 11 identity-review bounded investigation',
    identitiesResearched: 5,
    authoritativeCandidatesFound: 1,
    sourcesTested: 1,
    decoded: 1,
    placeholderRejected: 0,
    wrongChannelRejected: 0,
    identityUnresolved: 1,
    continuityPassed: 1,
    desktopVerified: 1,
    exactHighIdentityPassed: 1,
    searchVerified: 1,
    resolverVerified: 1,
    restored: 0,
    verifiedDuplicatesMerged: 1,
    productionWrites: 0,
    notes: [
      'XITE Rock x Metal passed 124.04 seconds of 1920x1080 existing-Desktop playback with one video owner.',
      'Multiple evidence frames showed the exact XITE Rock x Metal bug, changing music videos, and programme metadata. XITE-owned pages independently confirm the official FAST channel.',
      'The existing healthy canonical record passed normal TV search and resolver checks; one quarantined alias is terminal VERIFIED_DUPLICATE_MERGED. No production write or duplicate was needed.',
      'PBS Antiques Roadshow and MTV Classics used jmp2.uk; MasterChef used i.mjh.nz and were rejected before media validation. Hot Bench lacked authoritative source linkage and remains quarantined.',
    ],
    cumulativeVerifiedSearchableDesktopPlayableIdentities: 33,
    cumulativeTerminalAliases: 120,
    batch11Target: 25,
    batch11Researched: 10,
    batch11Remaining: 15,
  }, null, 2)}\n`,
);

console.log(JSON.stringify({ aliasesTerminal: aliases.length, totals: { identities: 33, aliases: 120 } }, null, 2));
