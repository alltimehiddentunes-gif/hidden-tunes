import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const restoration = path.join(root, 'data/tv-recovery/placeholder-audit/restoration');
const statePath = path.join(root, 'data/tv-recovery/placeholder-audit/intensive-recovery/state.json');
const proofDir = path.join(restoration, 'batch-013-run-003-bravo-vault-proof');
const metrics = JSON.parse(fs.readFileSync(path.join(proofDir, 'metrics.json'), 'utf8'));
const playback = metrics.metrics;
if (!metrics.pass || playback.videoElementCount !== 1 || playback.advancedSeconds < 120 || playback.fatal.length) throw new Error('Bravo Vault proof failed');

const candidateRecordId = 'd55ecd03-8f48-4f30-a4da-f02518af9cdd';
const completedAt = new Date().toISOString();
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const aliases = state.entries.filter((entry) => entry.alternativeRecordId === candidateRecordId && /Bravo Vault/i.test(entry.title));
if (aliases.length !== 1) throw new Error(`Unexpected alias count: ${aliases.length}`);

for (const entry of aliases) {
  entry.recoveryState = 'VERIFIED_DUPLICATE_MERGED';
  entry.attempts ??= [];
  entry.attempts.push({
    at: completedAt,
    method: 'FULL_RESTORE_SEARCH_DESKTOP_PROOF',
    result: 'VERIFIED_DUPLICATE_MERGED',
    candidateRecordId,
    authoritativeProvenance: 'NBCUNIVERSAL_OFFICIAL_BRAVO_VAULT_XUMO_FAST_FEED',
    identityConfidence: 'EXACT',
    identityEvidence: 'NBCUniversal officially launched Bravo Vault with Xumo; the candidate is on an NBCUniversal FAST host, normal Xumo and Hidden Tunes search identify Bravo Vault, and continuous frames showed its Bravo series programming.',
    continuitySeconds: Number(playback.advancedSeconds.toFixed(2)),
    desktopRuntime: 'PASS_1080P_ONE_VIDEO_OWNER_D_DRIVE_ONLY',
    productionSearch: 'PASS',
    productionResolver: 'PASS',
  });
}

state.updatedAt = completedAt;
fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
fs.writeFileSync(path.join(proofDir, 'final.json'), `${JSON.stringify({
  completedAt, identity: 'Bravo Vault', candidateRecordId, aliasesTerminal: aliases.length,
  identityConfidence: 'EXACT', desktopPlaybackSeconds: Number(playback.advancedSeconds.toFixed(2)),
  resolution: `${playback.width}x${playback.height}`, productionSearch: 'PASS', productionResolver: 'PASS',
  result: 'VERIFIED_DUPLICATE_MERGED', productionWrites: 0, duplicatesCreated: 0,
}, null, 2)}\n`);
fs.writeFileSync(path.join(restoration, 'batch-013-run-003.json'), `${JSON.stringify({
  completedAt, scope: 'Batch 13 identity-review bounded investigation', identitiesResearched: 5,
  authoritativeCandidatesFound: 3, sourcesTested: 1, decoded: 1, placeholderRejected: 0,
  wrongChannelRejected: 0, identityUnresolved: 2, continuityPassed: 1, desktopVerified: 1,
  exactHighIdentityPassed: 1, searchVerified: 1, resolverVerified: 1, restored: 0,
  verifiedDuplicatesMerged: 1, productionWrites: 0,
  notes: [
    'Bravo Vault passed 124.47 seconds of 1920x1080 existing-Desktop playback with one video owner through its NBCUniversal FAST feed.',
    'NBCUniversal officially launched Bravo Vault with Xumo. Xumo has a current public Bravo Vault channel page, and visual evidence showed continuous Bravo series programming; normal Hidden Tunes search and resolver passed.',
    'One quarantined alias is terminal VERIFIED_DUPLICATE_MERGED. No production write or duplicate was needed.',
    'Family Feud retained a plausible Samsung UK Amagi candidate but lacked complete exact channel linkage. Cheaters and MTV Reality used rejected jmp2.uk/i.mjh.nz sources; Bad Girls Club lacked complete exact candidate provenance.',
  ],
  cumulativeVerifiedSearchableDesktopPlayableIdentities: 39, cumulativeTerminalAliases: 136,
  batch13Target: 25, batch13Researched: 15, batch13Remaining: 10,
}, null, 2)}\n`);
console.log(JSON.stringify({ aliasesTerminal: aliases.length, totals: { identities: 39, aliases: 136 } }, null, 2));
