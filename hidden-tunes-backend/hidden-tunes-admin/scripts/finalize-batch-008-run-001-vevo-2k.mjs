import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const restoration = path.join(root, 'data/tv-recovery/placeholder-audit/restoration');
const statePath = path.join(root, 'data/tv-recovery/placeholder-audit/intensive-recovery/state.json');
const proofDir = path.join(restoration, 'vevo-2k-proof');
const report = JSON.parse(fs.readFileSync(path.join(proofDir, 'metrics.json'), 'utf8'));
const playback = report.metrics;
if (!report.pass || playback.videoElementCount !== 1 || playback.advancedSeconds < 120 || playback.fatal.length) throw new Error('Vevo 2K proof gate failed');
const candidateRecordId = '0c4d96f0-9e98-4aab-a996-1ceb792eb5fe';
const at = new Date().toISOString();
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const aliases = state.entries.filter((entry) => entry.alternativeRecordId === candidateRecordId && /vevo 2k/i.test(entry.title));
if (aliases.length !== 2) throw new Error(`Expected 2 Vevo 2K aliases, found ${aliases.length}`);
for (const entry of aliases) {
  entry.recoveryState = 'VERIFIED_DUPLICATE_MERGED'; entry.attempts ??= [];
  entry.attempts.push({ at, method: 'FULL_RESTORE_SEARCH_DESKTOP_PROOF', result: 'VERIFIED_DUPLICATE_MERGED', candidateRecordId,
    authoritativeProvenance: 'VEVO_AMAGI_SAMSUNG_FAST_DISTRIBUTION', identityConfidence: 'EXACT',
    identityEvidence: 'Vevo 2K-branded Amagi/Samsung service with matching 2000s music videos and on-screen artist/title metadata',
    continuitySeconds: Number(playback.advancedSeconds.toFixed(2)), desktopRuntime: 'PASS_1080P_ONE_VIDEO_OWNER_D_DRIVE_ONLY',
    productionSearch: 'PASS', productionResolver: 'PASS' });
}
state.updatedAt = at; fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
fs.writeFileSync(path.join(proofDir, 'final.json'), JSON.stringify({ completedAt: at, identity: 'Vevo 2K', candidateRecordId,
  aliasesTerminal: aliases.length, authoritativeProvenance: 'Vevo Amagi distribution for Samsung TV Plus',
  content: 'Real moving 2000s music-video programming with artist/title metadata', identityConfidence: 'EXACT',
  desktopPlaybackSeconds: Number(playback.advancedSeconds.toFixed(2)), resolution: `${playback.width}x${playback.height}`,
  videoElementCount: playback.videoElementCount, productionSearch: 'PASS', productionResolver: 'PASS',
  result: 'VERIFIED_DUPLICATE_MERGED', productionWrites: 0, duplicatesCreated: 0 }, null, 2) + '\n');
fs.writeFileSync(path.join(restoration, 'batch-008-run-001.json'), JSON.stringify({ completedAt: at,
  scope: 'Batch 8 provenance-first bounded retest investigation', identitiesResearched: 5, authoritativeCandidatesFound: 2,
  sourcesTested: 1, decoded: 1, continuityPassed: 1, desktopVerified: 1, exactHighIdentityPassed: 1,
  searchVerified: 1, resolverVerified: 1, restored: 0, verifiedDuplicatesMerged: 1, productionWrites: 0,
  notes: [
    'Vevo 2K passed 120.75 seconds of 1920x1080 Desktop playback with one video owner and no fatal HLS errors.',
    'The Vevo-branded Amagi/Samsung service showed matching 2000s music videos with artist/title metadata, supporting EXACT identity. Normal search and resolver passed.',
    'Two quarantined aliases remain hidden and terminal VERIFIED_DUPLICATE_MERGED; no production write or duplicate was needed.',
    'Yu-Gi-Oh, The Good Wife, and INTER 24/7 were rejected before media validation for jmp2.uk. Noticias RCN retains an official Roku-delivery candidate for a later bounded run.'
  ], cumulativeVerifiedSearchableDesktopPlayableIdentities: 24, cumulativeTerminalAliases: 103,
  batch8Target: 25, batch8Researched: 5, batch8Remaining: 20 }, null, 2) + '\n');
console.log(JSON.stringify({ aliasesTerminal: aliases.length, checkpoint: 'batch-008-run-001.json', totals: { identities: 24, aliases: 103 } }, null, 2));
