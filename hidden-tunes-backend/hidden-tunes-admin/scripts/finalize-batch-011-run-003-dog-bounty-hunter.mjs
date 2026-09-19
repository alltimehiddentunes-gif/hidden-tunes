import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const restoration = path.join(root, 'data/tv-recovery/placeholder-audit/restoration');
const statePath = path.join(root, 'data/tv-recovery/placeholder-audit/intensive-recovery/state.json');
const proofDir = path.join(restoration, 'dog-bounty-hunter-proof');
const metrics = JSON.parse(fs.readFileSync(path.join(proofDir, 'metrics.json'), 'utf8'));
const playback = metrics.metrics;

if (!metrics.pass || playback.videoElementCount !== 1 || playback.advancedSeconds < 120 || playback.fatal.length) {
  throw new Error('Dog the Bounty Hunter Desktop proof failed');
}

const candidateRecordId = '736ccc24-d1e3-4699-b8e0-a22d5982fa0d';
const completedAt = new Date().toISOString();
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const aliases = state.entries.filter(
  (entry) => entry.alternativeRecordId === candidateRecordId && /Dog(?: the| The) Bounty Hunter/i.test(entry.title),
);

if (aliases.length !== 10) throw new Error(`Unexpected alias count: ${aliases.length}`);

for (const entry of aliases) {
  entry.recoveryState = 'VERIFIED_DUPLICATE_MERGED';
  entry.attempts ??= [];
  entry.attempts.push({
    at: completedAt,
    method: 'FULL_RESTORE_SEARCH_DESKTOP_PROOF',
    result: 'VERIFIED_DUPLICATE_MERGED',
    candidateRecordId,
    authoritativeProvenance: 'TUBI_OFFICIAL_LIVE_CHANNEL_AND_TUBI_VIDEO_DELIVERY',
    identityConfidence: 'HIGH',
    identityEvidence: 'Tubi owns the exact Dog the Bounty Hunter live channel page and the candidate resolves through Tubi video delivery; continuous frames showed the matching series cast and real programme content',
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
    identity: 'Dog the Bounty Hunter',
    candidateRecordId,
    aliasesTerminal: aliases.length,
    identityConfidence: 'HIGH',
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
  path.join(restoration, 'batch-011-run-003.json'),
  `${JSON.stringify({
    completedAt,
    scope: 'Batch 11 identity-review bounded investigation',
    identitiesResearched: 5,
    authoritativeCandidatesFound: 3,
    sourcesTested: 1,
    decoded: 1,
    placeholderRejected: 0,
    wrongChannelRejected: 0,
    identityUnresolved: 2,
    continuityPassed: 1,
    desktopVerified: 1,
    exactHighIdentityPassed: 1,
    searchVerified: 1,
    resolverVerified: 1,
    restored: 0,
    verifiedDuplicatesMerged: 1,
    productionWrites: 0,
    notes: [
      'Dog the Bounty Hunter passed 124.12 seconds of 1920x1080 existing-Desktop playback with one video owner through Tubi video delivery.',
      'Tubi has an official exact-title live channel page. Multiple evidence frames showed changing real programme footage matching the series cast; normal TV search and resolver passed.',
      'Ten quarantined aliases are terminal VERIFIED_DUPLICATE_MERGED. No production write or duplicate was needed.',
      'OUTflix Movies used jmp2.uk and was rejected before media validation. ALLBLK Gems and Home. Made. Nation had legitimate brand evidence but insufficient direct source-to-channel proof; Euronews German remained identity-unresolved and all stay quarantined.',
    ],
    cumulativeVerifiedSearchableDesktopPlayableIdentities: 34,
    cumulativeTerminalAliases: 130,
    batch11Target: 25,
    batch11Researched: 15,
    batch11Remaining: 10,
  }, null, 2)}\n`,
);

console.log(JSON.stringify({ aliasesTerminal: aliases.length, totals: { identities: 34, aliases: 130 } }, null, 2));
