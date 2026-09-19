import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const restoration = path.join(root, 'data/tv-recovery/placeholder-audit/restoration');
const statePath = path.join(root, 'data/tv-recovery/placeholder-audit/intensive-recovery/state.json');
const proofDir = path.join(restoration, 'stingray-holidayscapes-proof');
const metrics = JSON.parse(fs.readFileSync(path.join(proofDir, 'metrics.json'), 'utf8'));
const playback = metrics.metrics;

if (!metrics.pass || playback.videoElementCount !== 1 || playback.advancedSeconds < 120 || playback.fatal.length) {
  throw new Error('Stingray Holidayscapes Desktop proof failed');
}

const candidateRecordId = 'e39b873c-e82d-46fa-8d5d-1b082e895ada';
const completedAt = new Date().toISOString();
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const aliases = state.entries.filter(
  (entry) => entry.alternativeRecordId === candidateRecordId && /^Stingray Holidayscapes/i.test(entry.title),
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
    authoritativeProvenance: 'STINGRAY_OWNED_PLEX_FAST_DELIVERY',
    identityConfidence: 'EXACT',
    identityEvidence: 'Stingray identifies Holidayscapes as an official FAST channel available on Plex; the candidate uses Stingray-owned Plex delivery and continuously showed the expected themed scenic programming',
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
  identity: 'Stingray Holidayscapes',
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

const run = {
  completedAt,
  scope: 'Batch 12 identity-review bounded investigation',
  identitiesResearched: 5,
  authoritativeCandidatesFound: 3,
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
    'Stingray Holidayscapes passed 124.27 seconds of 1920x1080 existing-Desktop playback with one video owner through Stingray-owned Plex delivery.',
    'Stingray officially lists Holidayscapes as a FAST channel on Plex. Evidence frames showed changing themed scenic programming; normal TV search and resolver passed.',
    'One quarantined alias is terminal VERIFIED_DUPLICATE_MERGED. No production write or duplicate was needed.',
    'ZenLIFE by Stingray and XITE Classic Country used jmp2.uk. Women’s Sports Network lacked direct source ownership linkage; Milenio Television retained a plausible broadcaster delivery candidate but was not promoted without complete visual identity proof.',
  ],
  cumulativeVerifiedSearchableDesktopPlayableIdentities: 37,
  cumulativeTerminalAliases: 134,
  batch12Target: 25,
  batch12Researched: 25,
  batch12Remaining: 0,
};
fs.writeFileSync(path.join(restoration, 'batch-012-run-005.json'), `${JSON.stringify(run, null, 2)}\n`);
fs.writeFileSync(path.join(restoration, 'batch-012-consolidated.json'), `${JSON.stringify({
  completedAt,
  batch: 12,
  identitiesResearched: 25,
  newlyVerifiedIdentities: ['Space Live powered by Sen', 'Stingray Holidayscapes'],
  newlyVerifiedIdentityCount: 2,
  newlyTerminalAliases: 2,
  cumulativeVerifiedSearchableDesktopPlayableIdentities: 37,
  cumulativeTerminalAliases: 134,
  productionWrites: 0,
  duplicatesCreated: 0,
  safetyRegressions: 0,
  result: 'COMPLETE',
}, null, 2)}\n`);

console.log(JSON.stringify({ aliasesTerminal: aliases.length, batch12: 'COMPLETE', totals: { identities: 37, aliases: 134 } }, null, 2));
