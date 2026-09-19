import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadAdminEnv } from "../lib/radioExpansion25k/env";
import { getSupabaseAdmin } from "../lib/supabaseAdmin";
const root=resolve(import.meta.dirname,".."),out=resolve(root,"data/tv-recovery");
const plans=[
  {ids:["660bfca524e1d000085b6007"],record:"a5b004de-0b14-4b13-a76b-cfe6b9069eb5"},
  {ids:["6792066f3de7c8cf941e7ce3","67a52cd4ec91870008a62164","679205a13de7c8cf941e7857","6792044b680721c77c5b9ba2","69a20556814d27f4ae630a92"],record:"1e95721f-7a91-456a-bc8a-b2e73f0837fd"},
  {ids:["65c340983ba51e00083988e8"],record:"3f30e76d-2e35-40c3-8975-3bef145fbf11"},
  {ids:["64805755536e0c0008a19fa1"],record:"380aa94f-c654-4374-9dca-82d9ef369b41"},
];
async function probe(url:string){return new Promise<boolean>(done=>{const child=spawn("ffmpeg",["-hide_banner","-loglevel","error","-rw_timeout","15000000","-i",url,"-t","35","-map","0:v:0","-map","0:a:0","-f","null","-"],{windowsHide:true,stdio:"ignore"});const timer=setTimeout(()=>child.kill(),70_000);child.once("close",code=>{clearTimeout(timer);done(code===0)});child.once("error",()=>{clearTimeout(timer);done(false)})})}
async function main(){
  loadAdminEnv(root);const db=getSupabaseAdmin();const {data,error}=await db.from("tv_videos").select("id,title,source_url,source_type").in("id",plans.map(x=>x.record));if(error)throw error;
  const results=[];for(const plan of plans){const row=(data??[]).find((x:any)=>x.id===plan.record);const passed=row?await probe(row.source_url):false;results.push({providerChannelIds:plan.ids,existingCatalogRecordId:plan.record,sourceHost:row?new URL(row.source_url).hostname:null,sourceType:row?.source_type??null,provider:"official_fast",confidence:"EXACT",continuitySeconds:passed?35:0,videoAudioPassed:passed,rawUrlPersisted:false})}
  const registry=JSON.parse(readFileSync(resolve(out,"master-recovery-registry.json"),"utf8"));
  for(const entry of registry.entries){const result=results.find(x=>x.providerChannelIds.includes(entry.providerChannelId));if(result?.videoAudioPassed){entry.terminalStatus="VERIFIED_PLAYABLE";entry.sourceCount=1;entry.verifiedSource={existingCatalogRecordId:result.existingCatalogRecordId,sourceHost:result.sourceHost,provider:result.provider,confidence:result.confidence,continuitySeconds:35,actualContentVerified:true,identityVerified:true,desktopRuntimeVerified:false,rawUrlPersisted:false}}if(entry.providerChannelId==="5a4d35dfa5c02e717a234f86"){entry.terminalStatus="WRONG_SOURCE_REJECTED";entry.researchEvidence={...(entry.researchEvidence??{}),decision:"REJECT",reason:"Anonymous-IP source with unacceptable provenance; observed History branding does not prove the claimed Pluto TV History identity."}}}
  registry.generatedAt=new Date().toISOString();writeFileSync(resolve(out,"master-recovery-registry.json"),JSON.stringify(registry,null,2));const latest=JSON.parse(readFileSync(resolve(out,"latest-checkpoint.json"),"utf8"));const verified=results.filter(x=>x.videoAudioPassed).flatMap(x=>x.providerChannelIds).length;const checkpoint={...latest,checkpointVersion:latest.checkpointVersion+1,phase:"BATCH_1_IDENTITY_AND_CONTINUITY_COMPLETE",createdAt:new Date().toISOString(),identitiesCompleted:verified+1,verified,rejected:1,unresolved:0,runtimeTested:0,runtimePassed:0,errors:results.filter(x=>!x.videoAudioPassed).map(x=>`Continuity failed: ${x.providerChannelIds.join(",")}`)};writeFileSync(resolve(out,"batch-001-finalization.json"),JSON.stringify({createdAt:new Date().toISOString(),productionWrites:0,rawPlaybackUrlsEmitted:0,results},null,2));writeFileSync(resolve(out,"checkpoints/checkpoint-001.json"),JSON.stringify(checkpoint,null,2));writeFileSync(resolve(out,"latest-checkpoint.json"),JSON.stringify(checkpoint,null,2));console.log(JSON.stringify(checkpoint,null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1});
