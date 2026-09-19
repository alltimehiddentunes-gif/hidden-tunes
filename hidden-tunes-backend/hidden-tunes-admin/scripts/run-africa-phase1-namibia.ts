/** Namibia Phase 1: official-source validation and idempotent import. Default is dry-run. */
/* eslint-disable @typescript-eslint/no-explicit-any -- shared probe results include evolving diagnostics. */
import fs from "node:fs"; import path from "node:path"; import {fileURLToPath} from "node:url";
import {loadAdminEnv} from "@/lib/radioExpansion25k/env"; import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {probeStreamUrl} from "@/lib/tvStreamProtocol"; import {importVerifiedTvGrowthCandidates,probeTvStation,type TvGrowthCandidate} from "@/lib/tvStationHealth";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."); loadAdminEnv(root);
const outDir=path.join(root,"data","africa-tv-phase1","namibia"); const reportFile=path.join(outDir,"report.json");
const project=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||""; const publish=process.argv.includes("--publish");
const candidates=[
 {title:"NBC 1",url:"https://hls2.nbcplus.na/hls/high_nbc1.m3u8",website:"https://www.nbc.na/",broadcaster:"Namibia Broadcasting Corporation",category:"General",sourceId:"NBC1.na"},
 {title:"NBC 2",url:"https://hls2.nbcplus.na/hls/high_nbc2.m3u8",website:"https://www.nbc.na/",broadcaster:"Namibia Broadcasting Corporation",category:"General",sourceId:"NBC2.na"},
 {title:"NBC 3",url:"https://hls2.nbcplus.na/hls/high_nbc3.m3u8",website:"https://www.nbc.na/",broadcaster:"Namibia Broadcasting Corporation",category:"General",sourceId:"NBC3.na"},
 {title:"NTV",url:"https://s-pl-01.mediatool.tv/playout/ntv-abr/index.m3u8",website:"https://oneuptwo.com/",broadcaster:"OneUpTwo",category:"General",sourceId:"NTV.na"},
 {title:"Tjil TV",url:"https://hls-1zdhtxpm-livepush.akamaized.net/live_cdn/nsM12Xw0C1xXdJ/em0Wx71z-ec6EWJb/rewind-3600.m3u8",website:"https://oneuptwo.com/tjilTV",broadcaster:"OneUpTwo",category:"Entertainment",sourceId:"TjilTV.na"},
] as const;
function save(v:unknown){fs.mkdirSync(outDir,{recursive:true});fs.writeFileSync(reportFile,JSON.stringify(v,null,2));}
async function existing(){const {data,error}=await getSupabaseAdmin().from("tv_videos").select("id,title,source_id,source_url,validated_stream_url,region").or(`region.eq.NA,region.eq.Namibia`);if(error)throw error;return data||[];}
async function main(){
 console.log(JSON.stringify({project,table:"tv_videos",mode:publish?"PUBLISH":"DRY_RUN"}));
 const before=await existing(); const outcomes=[] as any[];
 for(const c of candidates){try{const direct=await probeStreamUrl(c.url,{timeoutMs:25000});const health=await probeTvStation({id:"candidate",title:c.title,source_id:c.sourceId,source_url:c.url,source_type:"hls_stream",embed_url:null,status:"approved",playback_status:"unchecked",is_active:false});const accepted=Boolean(direct.playable&&health.playable);outcomes.push({candidate:c,state:accepted?"Accepted":"Rejected",reason:accepted?"official_source_and_shared_probe_passed":direct.reason,protocol:direct.protocol,finalUrl:direct.finalUrl,ios:health.ios_playable,android:health.android_playable,desktop:direct.playable,tv:direct.playable});}catch(e){outcomes.push({candidate:c,state:"Rejected",reason:`exception:${String(e).slice(0,200)}`});}}
 const accepted=outcomes.filter(o=>o.state==="Accepted"); const existingKeys=new Set(before.flatMap((r:any)=>[String(r.source_id||""),String(r.source_url||""),String(r.validated_stream_url||"")]));
 const fresh=accepted.filter(o=>!existingKeys.has(o.candidate.sourceId)&&!existingKeys.has(o.candidate.url));
 const payloads:TvGrowthCandidate[]=fresh.map(o=>({title:o.candidate.title,description:`${o.candidate.title}, a verified live television service from ${o.candidate.broadcaster}. Official source page: ${o.candidate.website}`,source_url:o.finalUrl||o.candidate.url,source_type:"hls_stream",source_id:o.candidate.sourceId,source_key:`africa-phase1:NA:${o.candidate.sourceId}`,country:"NA",region:"NA",language:"English",category:o.candidate.category,tags:["Africa","Namibia","official-source"]}));
 let imported=0,rejected=0;if(publish){if(project!=="https://kojcyswxfuikxmqntwye.supabase.co")throw new Error(`Unexpected project ${project}`);if(!accepted.length||payloads.length!==fresh.length)throw new Error("Refusing publish: no independently accepted payload is available.");({imported,rejected}=await importVerifiedTvGrowthCandidates(payloads));}
 const after=publish?await existing():before;const report={at:new Date().toISOString(),country:"Namibia",mode:publish?"PUBLISHED":"DRY_RUN",officialSources:["https://www.nbc.na/","https://nbcplus.na/home","https://oneuptwo.com/"],publicIptvSources:["https://iptv-org.github.io/api/channels.json","https://iptv-org.github.io/api/streams.json"],candidatesDiscovered:candidates.length,candidatesTested:outcomes.length,accepted:accepted.length,rejected:outcomes.length-accepted.length,existingBefore:before.length,deduplicated:accepted.length-fresh.length,proposedImports:payloads.length,imported,importRejected:rejected,finalCount:after.length,outcomes};save(report);console.log(JSON.stringify(report,null,2));
}
main().catch(e=>{console.error(e);process.exit(1)});
