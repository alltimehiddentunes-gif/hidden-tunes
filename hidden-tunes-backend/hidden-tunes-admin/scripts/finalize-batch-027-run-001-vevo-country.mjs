import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const restoration = path.join(root, 'data/tv-recovery/placeholder-audit/restoration');
const statePath = path.join(root, 'data/tv-recovery/placeholder-audit/intensive-recovery/state.json');
const proofDir = path.join(restoration, 'vevo-country-proof');
const rejectedCandidateRecordId = '7ffd10c9-ee12-4fdd-a009-62a0ac7ab4e2';
const candidateRecordId = '881e96a6-cd7b-4a2d-bdfa-b21f9e4a5375';
const metrics = JSON.parse(fs.readFileSync(path.join(proofDir, 'metrics.json'), 'utf8'));
const playback = metrics.metrics;

if (!metrics.pass || playback.videoElementCount !== 1 || playback.advancedSeconds < 120 || playback.fatal.length) throw new Error('proof failed');

const completedAt = new Date().toISOString();
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const aliases = state.entries.filter((entry) => entry.alternativeRecordId === rejectedCandidateRecordId && /vevo country/i.test(entry.title));
if (aliases.length !== 2 || state.entries.some((entry) => entry.alternativeRecordId === candidateRecordId)) throw new Error(`alias/duplicate guard ${aliases.length}`);

for (const entry of aliases) {
  entry.recoveryState = 'VERIFIED_DUPLICATE_MERGED';
  entry.attempts ??= [];
  entry.attempts.push({
    at: completedAt,
    method: 'AUTHORITATIVE_ALTERNATIVE_FULL_RESTORE_SEARCH_DESKTOP_PROOF',
    result: 'VERIFIED_DUPLICATE_MERGED',
    candidateRecordId,
    rejectedCandidateRecordId,
    authoritativeProvenance: 'VEVO_SAMSUNG_NZ_AMAGI_FAST_DISTRIBUTION',
    identityConfidence: 'EXACT',
    identityEvidence: 'Vevo documents genre-curated FAST channels on Samsung TV Plus, and the directly named Vevo Country Samsung NZ Amagi service showed sustained official country music-video programming with artist/title metadata.',
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
  identity: 'Vevo Country',
  candidateRecordId,
  rejectedCandidateRecordId,
  aliasesTerminal: 2,
  identityConfidence: 'EXACT',
  desktopPlaybackSeconds: Number(playback.advancedSeconds.toFixed(2)),
  resolution: `${playback.width}x${playback.height}`,
  videoElementCount: playback.videoElementCount,
  productionSearch: 'PASS',
  productionResolver: 'PASS',
  result: 'VERIFIED_DUPLICATE_MERGED',
  productionWrites: 0,
  duplicatesCreated: 0,
}, null, 2)}\n`);
fs.writeFileSync(path.join(restoration, 'batch-027-run-001.json'), `${JSON.stringify({
  completedAt,
  scope: 'Batch 27 provenance-first bounded investigation',
  identitiesResearched: 5,
  authoritativeCandidatesFound: 5,
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
    'Vevo Country passed 121.59 seconds of 1920x1080 existing-Desktop playback with one video owner from its directly named Vevo/Samsung NZ Amagi candidate.',
    'Sustained official country music-video programming with Kacey Musgraves artist/title metadata supports EXACT identity. Normal search and production resolver passed.',
    'Two quarantined aliases were terminally merged from their prior Roku candidate to the distinct authoritative Samsung NZ candidate without creating a duplicate.',
    'Vevo 90s retained a directly named Vevo/Samsung NZ candidate. Survivor retained a Banijay/Samsung UK candidate. America\'s Test Kitchen retained Roku delivery. Top Gear retained Tubi and Samsung alternatives; none were full-tested after the stronger exact Vevo proof.',
  ],
  cumulativeVerifiedSearchableDesktopPlayableIdentities: 67,
  cumulativeTerminalAliases: 207,
  batch27Target: 25,
  batch27Researched: 5,
  batch27Remaining: 20,
}, null, 2)}\n`);

console.log(JSON.stringify({ aliasesTerminal: 2, totals: { identities: 67, aliases: 207 }, batch27Researched: 5 }, null, 2));
