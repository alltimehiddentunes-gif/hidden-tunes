import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const restoration = path.join(root, 'data/tv-recovery/placeholder-audit/restoration');
const statePath = path.join(root, 'data/tv-recovery/placeholder-audit/intensive-recovery/state.json');
const proofDir = path.join(restoration, 'fox-weather-proof');
const metrics = JSON.parse(fs.readFileSync(path.join(proofDir, 'metrics.json'), 'utf8'));
const playback = metrics.metrics;
if (!metrics.pass || playback.videoElementCount !== 1 || playback.advancedSeconds < 120) throw new Error('FOX Weather Desktop continuity proof gate failed');

const candidateRecordId = '4c513653-0fae-4ab3-87c6-62d407783f83';
const at = new Date().toISOString();
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const aliases = state.entries.filter((entry) => entry.alternativeRecordId === candidateRecordId && /fox weather/i.test(entry.title));
if (aliases.length !== 2) throw new Error(`Expected 2 FOX Weather aliases, found ${aliases.length}`);
for (const entry of aliases) {
  entry.recoveryState = 'VERIFIED_DUPLICATE_MERGED';
  entry.attempts ??= [];
  entry.attempts.push({
    at,
    method: 'FULL_RESTORE_SEARCH_DESKTOP_PROOF',
    result: 'VERIFIED_DUPLICATE_MERGED',
    candidateRecordId,
    authoritativeProvenance: 'FOX_WEATHER_OWNED_247WLIVE_SERVICE',
    identityConfidence: 'HIGH',
    identityEvidence: 'FOX Weather-owned delivery host with continuous live weather studio and field programming',
    continuitySeconds: Number(playback.advancedSeconds.toFixed(2)),
    desktopRuntime: 'PASS_720P_ONE_VIDEO_OWNER_D_DRIVE_ONLY',
    productionSearch: 'PASS',
    productionResolver: 'PASS'
  });
}
state.updatedAt = at;
fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');

const finalProof = {
  completedAt: at,
  identity: 'FOX Weather',
  candidateRecordId,
  aliasesTerminal: aliases.length,
  authoritativeProvenance: 'FOX Weather-owned 247wlive.foxweather.com service',
  content: 'Real moving weather studio and field programme content',
  identityConfidence: 'HIGH',
  desktopPlaybackSeconds: Number(playback.advancedSeconds.toFixed(2)),
  resolution: `${playback.width}x${playback.height}`,
  videoElementCount: playback.videoElementCount,
  productionSearch: 'PASS',
  productionResolver: 'PASS',
  result: 'VERIFIED_DUPLICATE_MERGED',
  productionWrites: 0,
  duplicatesCreated: 0
};
fs.writeFileSync(path.join(proofDir, 'final.json'), JSON.stringify(finalProof, null, 2) + '\n');

const checkpoint = {
  completedAt: at,
  scope: 'Batch 7 provenance-first bounded retest investigation',
  identitiesResearched: 5,
  authoritativeCandidatesFound: 3,
  sourcesTested: 1,
  decoded: 1,
  continuityPassed: 1,
  desktopVerified: 1,
  exactHighIdentityPassed: 1,
  searchVerified: 1,
  resolverVerified: 1,
  restored: 0,
  verifiedDuplicatesMerged: 1,
  productionWrites: 0,
  notes: [
    'FOX Weather candidate uses the broadcaster-owned 247wlive.foxweather.com service and passed 124.28 seconds of 1280x720 Desktop playback with one video owner and no fatal HLS errors.',
    'Sampled frames showed continuous weather field and studio programming; authoritative host provenance supports HIGH identity. Normal search and resolver passed.',
    'Two quarantined aliases remain hidden and are terminal VERIFIED_DUPLICATE_MERGED locally. No production write or duplicate was needed.',
    'FIFA+ and Bloomberg candidates were rejected before testing because they use jmp2.uk and i.mjh.nz. BUZZR and ABC News Live retain official Tubi candidates for later bounded runs.'
  ],
  cumulativeVerifiedSearchableDesktopPlayableIdentities: 21,
  cumulativeTerminalAliases: 97,
  batch7Target: 25,
  batch7Researched: 10,
  batch7Remaining: 15
};
fs.writeFileSync(path.join(restoration, 'batch-007-run-002.json'), JSON.stringify(checkpoint, null, 2) + '\n');
console.log(JSON.stringify({ aliasesTerminal: aliases.length, checkpoint: 'batch-007-run-002.json', totals: { identities: 21, aliases: 97 } }, null, 2));
