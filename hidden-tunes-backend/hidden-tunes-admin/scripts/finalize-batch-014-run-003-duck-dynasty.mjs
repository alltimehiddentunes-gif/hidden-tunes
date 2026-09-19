import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const restoration = path.join(root, 'data/tv-recovery/placeholder-audit/restoration');
const statePath = path.join(root, 'data/tv-recovery/placeholder-audit/intensive-recovery/state.json');
const proofDir = path.join(restoration, 'batch-014-run-003-duck-dynasty-proof');
const metrics = JSON.parse(fs.readFileSync(path.join(proofDir, 'metrics.json'), 'utf8'));
const playback = metrics.metrics;
if (!metrics.pass || playback.videoElementCount !== 1 || playback.advancedSeconds < 120 || playback.fatal.length) throw new Error('Duck Dynasty proof failed');

const candidateRecordId = 'e8c053a1-7eff-4f70-a8b6-c27bf644fb2a';
const completedAt = new Date().toISOString();
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const aliases = state.entries.filter((entry) => entry.alternativeRecordId === candidateRecordId && /^Duck Dynasty/i.test(entry.title));
if (aliases.length !== 9) throw new Error(`Unexpected alias count: ${aliases.length}`);

for (const entry of aliases) {
  entry.recoveryState = 'VERIFIED_DUPLICATE_MERGED';
  entry.attempts ??= [];
  entry.attempts.push({
    at: completedAt,
    method: 'FULL_RESTORE_SEARCH_DESKTOP_PROOF',
    result: 'VERIFIED_DUPLICATE_MERGED',
    candidateRecordId,
    authoritativeProvenance: 'OFFICIAL_FAST_DUCK_DYNASTY_RAKUTEN_UK_AMAGI_FEED',
    identityConfidence: 'EXACT',
    identityEvidence: 'The dedicated Duck Dynasty FAST channel is carried by authoritative distributors; the candidate is a Rakuten UK Amagi feed and continuous evidence showed an explicit Best of Duck Dynasty title card and programme content.',
    continuitySeconds: Number(playback.advancedSeconds.toFixed(2)),
    desktopRuntime: 'PASS_1080P_ONE_VIDEO_OWNER_D_DRIVE_ONLY',
    productionSearch: 'PASS',
    productionResolver: 'PASS',
  });
}

state.updatedAt = completedAt;
fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
fs.writeFileSync(path.join(proofDir, 'final.json'), `${JSON.stringify({
  completedAt, identity: 'Duck Dynasty', candidateRecordId, aliasesTerminal: aliases.length,
  identityConfidence: 'EXACT', desktopPlaybackSeconds: Number(playback.advancedSeconds.toFixed(2)),
  resolution: `${playback.width}x${playback.height}`, productionSearch: 'PASS', productionResolver: 'PASS',
  result: 'VERIFIED_DUPLICATE_MERGED', productionWrites: 0, duplicatesCreated: 0,
}, null, 2)}\n`);
fs.writeFileSync(path.join(restoration, 'batch-014-run-003.json'), `${JSON.stringify({
  completedAt, scope: 'Batch 14 identity-review bounded investigation', identitiesResearched: 5,
  authoritativeCandidatesFound: 2, sourcesTested: 1, decoded: 1, placeholderRejected: 0,
  wrongChannelRejected: 0, identityUnresolved: 1, continuityPassed: 1, desktopVerified: 1,
  exactHighIdentityPassed: 1, searchVerified: 1, resolverVerified: 1, restored: 0,
  verifiedDuplicatesMerged: 6, productionWrites: 0,
  notes: [
    'Duck Dynasty passed 124.95 seconds of 1920x1080 existing-Desktop playback with one video owner through its Rakuten UK Amagi feed.',
    'Visual evidence included an explicit Best of Duck Dynasty title card and continuous programme content; normal Hidden Tunes search and resolver passed.',
    'Nine quarantined aliases are terminal VERIFIED_DUPLICATE_MERGED. No production write or duplicate was needed.',
    'Pluto TV True Crime, Top Rank Classics, and Dog Whisperer used rejected jmp2.uk sources. Euronews Spanish was not repeated without materially new exact-identity evidence.',
  ],
  cumulativeVerifiedSearchableDesktopPlayableIdentities: 40, cumulativeTerminalAliases: 145,
  batch14Target: 25, batch14Researched: 15, batch14Remaining: 10,
}, null, 2)}\n`);
console.log(JSON.stringify({ aliasesTerminal: aliases.length, totals: { identities: 40, aliases: 145 } }, null, 2));
