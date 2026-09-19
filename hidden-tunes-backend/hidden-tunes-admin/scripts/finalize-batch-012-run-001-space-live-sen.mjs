import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const restoration = path.join(root, 'data/tv-recovery/placeholder-audit/restoration');
const statePath = path.join(root, 'data/tv-recovery/placeholder-audit/intensive-recovery/state.json');
const proofDir = path.join(restoration, 'space-live-sen-proof');
const metrics = JSON.parse(fs.readFileSync(path.join(proofDir, 'metrics.json'), 'utf8'));
const playback = metrics.metrics;

if (!metrics.pass || playback.videoElementCount !== 1 || playback.advancedSeconds < 120 || playback.fatal.length) {
  throw new Error('Space Live powered by Sen Desktop proof failed');
}

const candidateRecordId = '34ed9dc7-f88d-45c0-94ac-d62023ba5b61';
const completedAt = new Date().toISOString();
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const aliases = state.entries.filter(
  (entry) => entry.alternativeRecordId === candidateRecordId && /^Space Live powered by sen/i.test(entry.title),
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
    authoritativeProvenance: 'SEN_OFFICIAL_FAST_CHANNEL_VIA_ITV_STUDIOS_AND_FREQUENCY_DISTRIBUTION',
    identityConfidence: 'EXACT',
    identityEvidence: 'Sen identifies Space Live powered by Sen as its official 24/7 FAST channel; the candidate uses Frequency channel 1224 and continuously showed the expected branded ISS Earth feed',
    continuitySeconds: Number(playback.advancedSeconds.toFixed(2)),
    desktopRuntime: 'PASS_1080P_ONE_VIDEO_OWNER_D_DRIVE_ONLY',
    productionSearch: 'PASS',
    productionResolver: 'PASS',
  });
}

state.updatedAt = completedAt;
fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
fs.writeFileSync(path.join(proofDir, 'final.json'), `${JSON.stringify({
  completedAt,
  identity: 'Space Live powered by Sen',
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
}, null, 2)}\n`);
fs.writeFileSync(path.join(restoration, 'batch-012-run-001.json'), `${JSON.stringify({
  completedAt,
  scope: 'Batch 12 identity-review bounded investigation',
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
    'Space Live powered by Sen passed 122.90 seconds of 1920x1080 existing-Desktop playback with one video owner.',
    'Sen and ITV Studios provide authoritative FAST provenance. Frequency channel 1224 delivered a continuously changing branded ISS Earth feed; normal TV search and resolver passed.',
    'One quarantined alias is terminal VERIFIED_DUPLICATE_MERGED. No production write or duplicate was needed.',
    'PBS Nature used jmp2.uk. TODAY All Day and The Graham Norton Show retained plausible official sources but lacked complete source-to-identity evidence; The Addams Family also remained unresolved. All stay quarantined.',
  ],
  cumulativeVerifiedSearchableDesktopPlayableIdentities: 36,
  cumulativeTerminalAliases: 133,
  batch12Target: 25,
  batch12Researched: 5,
  batch12Remaining: 20,
}, null, 2)}\n`);

console.log(JSON.stringify({ aliasesTerminal: aliases.length, totals: { identities: 36, aliases: 133 } }, null, 2));
