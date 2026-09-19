/** Resumable Africa-wide TV discovery, validation and production import. */
/* eslint-disable @typescript-eslint/no-explicit-any -- external discovery and legacy DB rows are schema-tolerant. */
import fs from "node:fs"; import path from "node:path"; import {fileURLToPath} from "node:url"; import {createHash} from "node:crypto";
import {loadAdminEnv} from "@/lib/radioExpansion25k/env"; import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {probeStreamUrl} from "@/lib/tvStreamProtocol"; import {probeTvStation,importVerifiedTvGrowthCandidates,type TvGrowthCandidate} from "@/lib/tvStationHealth";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");loadAdminEnv(root);
const outDir=path.join(root,"data","africa-tv-import-all");const project=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||"";const publish=process.argv.includes("--publish");
const cpFile=path.join(outDir,publish?"checkpoint-publish.json":"checkpoint-dry-run.json");const reportFile=path.join(outDir,publish?"report-publish.json":"report-dry-run.json");const concurrency=Math.max(1,Math.min(6,Number(arg("concurrency","3"))||3));
const countries=[
 ["DZ","Algeria"],["AO","Angola"],["BJ","Benin"],["BW","Botswana"],["BF","Burkina Faso"],["BI","Burundi"],["CV","Cabo Verde"],["CM","Cameroon"],["CF","Central African Republic"],["TD","Chad"],["KM","Comoros"],["CD","Democratic Republic of the Congo"],["CG","Republic of the Congo"],["CI","Côte d’Ivoire"],["DJ","Djibouti"],["EG","Egypt"],["GQ","Equatorial Guinea"],["ER","Eritrea"],["SZ","Eswatini"],["ET","Ethiopia"],["GA","Gabon"],["GM","The Gambia"],["GH","Ghana"],["GN","Guinea"],["GW","Guinea-Bissau"],["KE","Kenya"],["LS","Lesotho"],["LR","Liberia"],["LY","Libya"],["MG","Madagascar"],["MW","Malawi"],["ML","Mali"],["MR","Mauritania"],["MU","Mauritius"],["MA","Morocco"],["MZ","Mozambique"],["NA","Namibia"],["NE","Niger"],["NG","Nigeria"],["RW","Rwanda"],["ST","São Tomé and Príncipe"],["SN","Senegal"],["SC","Seychelles"],["SL","Sierra Leone"],["SO","Somalia"],["ZA","South Africa"],["SS","South Sudan"],["SD","Sudan"],["TZ","Tanzania"],["TG","Togo"],["TN","Tunisia"],["UG","Uganda"],["ZM","Zambia"],["ZW","Zimbabwe"]
] as const;
type Outcome={key:string;country:string;title:string;url:string;state:"accepted"|"rejected"|"quarantined"|"imported"|"duplicate";reason:string;protocol?:string;ios?:boolean;android?:boolean;website?:string|null;sourceId?:string};
type Checkpoint={startedAt:string;updatedAt:string;completedCountries:string[];outcomes:Record<string,Outcome>};
function arg(n:string,d:string){const h=process.argv.find(v=>v.startsWith(`--${n}=`));return h?h.slice(n.length+3):d}function save(f:string,v:unknown){fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(v,null,2))}function read<T>(f:string,d:T):T{return fs.existsSync(f)?JSON.parse(fs.readFileSync(f,"utf8"))as T:d}
function key(code:string,id:string,url:string){return createHash("sha1").update(`${code}|${id}|${url}`).digest("hex").slice(0,20)}
function host(u:string|undefined|null){try{return new URL(String(u||"")).hostname.toLowerCase().replace(/^www\./,"")}catch{return""}}
function base(h:string){const p=h.split(".");return p.length>2?p.slice(-2).join("."):h}
const trustedCdn=/(?:akamaized\.net|akamaihd\.net|cloudfront\.net|fastly\.net|cdn\.jwplayer\.com|mediacp\.|streamlock\.net|dacast\.com|wowza|mncdn\.com|mmdlive\.ltd|brightcove|mux\.com)$/i;
const blocked=/(?:youtube|youtu\.be|facebook|twitch|dailymotion|vimeo|pluto\.tv|xtream|freeott|mcquack|cinerama)/i;
function provenance(website:string|null|undefined,url:string){const wh=host(website),sh=host(url);if(!wh)return{ok:false,reason:"missing_official_website"};if(blocked.test(sh))return{ok:false,reason:"blocked_or_opaque_source"};if(wh===sh||sh.endsWith(`.${wh}`)||base(wh)===base(sh))return{ok:true,reason:"official_domain_or_subdomain"};if(trustedCdn.test(sh))return{ok:true,reason:"official_website_with_reputable_cdn"};return{ok:false,reason:"stream_host_not_tied_to_official_source"}}
async function json(url:string){const r=await fetch(url,{headers:{"User-Agent":"HiddenTunes/1.0 Africa-TV-import"},signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error(`${r.status} ${url}`);return r.json()}
async function pool<T>(xs:T[],fn:(x:T)=>Promise<void>){let n=0;await Promise.all(Array.from({length:Math.min(concurrency,xs.length)},async()=>{while(n<xs.length){const i=n++;await fn(xs[i])}}))}
async function existing(code:string){const {data,error}=await getSupabaseAdmin().from("tv_videos").select("id,title,source_id,source_url,validated_stream_url,region").eq("region",code);if(error)throw error;return data||[]}
async function main(){
 if(publish&&project!=="https://kojcyswxfuikxmqntwye.supabase.co")throw new Error(`Refusing unexpected project ${project}`);
 console.log(JSON.stringify({project,table:"tv_videos",mode:publish?"VALIDATE_AND_PUBLISH":"DRY_RUN",countries:54,concurrency}));
 const channels:any[]=await json("https://iptv-org.github.io/api/channels.json");const streams:any[]=await json("https://iptv-org.github.io/api/streams.json");const channelMap=new Map(channels.map(c=>[c.id,c]));
 const cp=read<Checkpoint>(cpFile,{startedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),completedCountries:[],outcomes:{}});
 for(let index=0;index<countries.length;index++){const [code,name]=countries[index];if(cp.completedCountries.includes(code)){console.log(`Country ${index+1}/54 — ${name} (checkpoint complete)`);continue}
  const db=await existing(code);const dbIds=new Set(db.map((r:any)=>String(r.source_id||"")));const dbUrls=new Set(db.flatMap((r:any)=>[String(r.source_url||""),String(r.validated_stream_url||"")]));
  const candidates=streams.map(s=>({s,c:channelMap.get(s.channel)})).filter(x=>x.c&&String(x.c.country).toUpperCase()===code&&!x.c.is_nsfw&&x.s.url);
  let tested=0,imported=0,rejected=0,quarantined=0,duplicates=0;console.log(`Country ${index+1}/54 — ${name} | discovered ${candidates.length}`);
  await pool(candidates,async({s,c})=>{const k=key(code,String(c.id),String(s.url));if(cp.outcomes[k])return;tested++;const p=provenance(c.website,s.url);
   if(dbIds.has(String(c.id))||dbUrls.has(String(s.url))){cp.outcomes[k]={key:k,country:code,title:c.name,url:s.url,state:"duplicate",reason:"already_in_production",sourceId:c.id,website:c.website};duplicates++;return}
   if(!p.ok){cp.outcomes[k]={key:k,country:code,title:c.name,url:s.url,state:"quarantined",reason:p.reason,sourceId:c.id,website:c.website};quarantined++;return}
   try{const direct=await probeStreamUrl(s.url,{timeoutMs:25000});const health=await probeTvStation({id:"candidate",title:c.name,source_type:"hls_stream",source_id:c.id,source_url:s.url,embed_url:null,status:"approved",playback_status:"unchecked",is_active:false});if(!direct.playable||!health.playable){cp.outcomes[k]={key:k,country:code,title:c.name,url:s.url,state:"rejected",reason:direct.reason||health.reason,protocol:direct.protocol,sourceId:c.id,website:c.website};rejected++;return}
    const accepted:Outcome={key:k,country:code,title:c.name,url:direct.finalUrl||s.url,state:"accepted",reason:p.reason,protocol:direct.protocol,ios:health.ios_playable,android:health.android_playable,sourceId:c.id,website:c.website};
    if(publish){const payload:TvGrowthCandidate={source_type:"hls_stream",source_id:c.id,source_url:accepted.url,source_key:`africa-all:${code}:${c.id}`,title:c.name,description:`${c.name}, verified live television for ${name}. Official source: ${c.website}`,thumbnail_url:c.logo||null,category:Array.isArray(c.categories)?c.categories[0]||"General":"General",categories:c.categories||[],country:code,region:code,language:Array.isArray(c.languages)?c.languages[0]||null:null,tags:["Africa",name,"verified-public-source"]};const r=await importVerifiedTvGrowthCandidates([payload]);if(r.imported===1){accepted.state="imported";imported++}else{accepted.state="duplicate";accepted.reason="shared_importer_deduplicated_or_rejected";duplicates++}}
    cp.outcomes[k]=accepted;
   }catch(e){cp.outcomes[k]={key:k,country:code,title:c.name,url:s.url,state:"rejected",reason:`exception:${String(e).slice(0,180)}`,sourceId:c.id,website:c.website};rejected++}
   cp.updatedAt=new Date().toISOString();save(cpFile,cp);
  });
  cp.completedCountries.push(code);cp.updatedAt=new Date().toISOString();save(cpFile,cp);console.log(`Tested: ${tested} | Imported: ${imported} | Rejected: ${rejected} | Quarantined: ${quarantined} | Duplicates: ${duplicates}`);
 }
 const outcomes=Object.values(cp.outcomes);const report={at:new Date().toISOString(),project,table:"tv_videos",mode:publish?"PUBLISHED":"DRY_RUN",countriesCompleted:cp.completedCountries.length,candidates:outcomes.length,tested:outcomes.filter(o=>!["quarantined","duplicate"].includes(o.state)).length,imported:outcomes.filter(o=>o.state==="imported").length,acceptedDryRun:outcomes.filter(o=>o.state==="accepted").length,rejected:outcomes.filter(o=>o.state==="rejected").length,quarantined:outcomes.filter(o=>o.state==="quarantined").length,duplicates:outcomes.filter(o=>o.state==="duplicate").length,byCountry:Object.fromEntries(countries.map(([code,name])=>[code,{name,outcomes:outcomes.filter(o=>o.country===code)}]))};save(reportFile,report);console.log(JSON.stringify({...report,byCountry:undefined},null,2));
}
main().catch(e=>{console.error(e);process.exit(1)});
