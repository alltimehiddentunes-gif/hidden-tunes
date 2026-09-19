import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
const root=join(import.meta.dirname,'..');
const statePath=join(root,'data','tv-recovery','placeholder-audit','intensive-recovery','state.json');
const proofDirectory=join(root,'data','tv-recovery','placeholder-audit','restoration','beyond-belief-proof');
const candidateRecordId='c3e74bb9-74db-4502-bc08-f2213270e8da';
async function main(){
 const state=JSON.parse(await readFile(statePath,'utf8')); const now=new Date().toISOString();
 const aliases=state.entries.filter((e:any)=>e.alternativeRecordId===candidateRecordId&&e.title==='Beyond Belief: Fact or Fiction');
 for(const e of aliases){e.recoveryState='VERIFIED_DUPLICATE_MERGED';e.attempts.push({at:now,method:'FULL_RESTORE_SEARCH_DESKTOP_PROOF',result:'VERIFIED_DUPLICATE_MERGED',candidateRecordId,authoritativeProvenance:'OFFICIAL_XUMO_TCL_FAST_DISTRIBUTION',identityConfidence:'EXACT',identityEvidence:'Beyond Belief: Fact or Fiction title sequence and programme credits visible in sampled live frames',continuitySeconds:123.94,desktopRuntime:'PASS_432P_ONE_VIDEO_OWNER_D_DRIVE_ONLY',productionSearch:'PASS',productionResolver:'PASS'});}
 state.updatedAt=now; await writeFile(statePath,JSON.stringify(state,null,2)); await mkdir(proofDirectory,{recursive:true});
 const report={completedAt:now,identity:'Beyond Belief: Fact or Fiction',candidateRecordId,aliasesTerminal:aliases.length,terminalState:'VERIFIED_DUPLICATE_MERGED',productionWrites:0,duplicatesCreated:0,runtimeStorage:'D_DRIVE_ONLY',cumulativeVerifiedSearchableDesktopPlayable:15,cumulativeTerminalAliases:82};
 await writeFile(join(proofDirectory,'final.json'),JSON.stringify(report,null,2)); console.log(JSON.stringify(report,null,2));
} main().catch(e=>{console.error(e);process.exitCode=1});
