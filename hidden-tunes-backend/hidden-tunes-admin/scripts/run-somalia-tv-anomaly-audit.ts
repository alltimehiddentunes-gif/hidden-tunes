/**
 * Resumable, read-only Somalia TV anomaly audit.
 * npx tsx scripts/run-somalia-tv-anomaly-audit.ts [--concurrency=4] [--limit=N] [--resume]
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- anomaly audit inspects legacy rows with heterogeneous metadata. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { classifyStreamUrl, probeStreamUrl } from "@/lib/tvStreamProtocol";
import { probeTvStation, validatePublicTvUrl } from "@/lib/tvStationHealth";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadAdminEnv(root);
const outDir = path.join(root, "data", "africa-tv-phase1", "somalia");
const resultsFile = path.join(outDir, "probe-results.json");
const reportFile = path.join(outDir, "somalia-anomaly-report.json");
const concurrency = Math.max(1, Math.min(8, Number(arg("concurrency", "4")) || 4));
const limit = Math.max(0, Number(arg("limit", "0")) || 0);

type Row = Record<string, any> & { id: string; title: string | null; region: string | null };
type Probe = { id: string; at: string; url: string | null; protocol: string; playable: boolean;
  reason: string; finalUrl?: string | null; iosPlayable?: boolean; androidPlayable?: boolean };
function arg(name: string, fallback: string) {
  const hit = process.argv.find(v => v.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}
function normName(v: unknown) { return String(v || "").toLowerCase().replace(/\b(hd|fhd|sd|uhd|4k|live|tv)\b/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim(); }
function normUrl(v: unknown) { try { const u = new URL(String(v || "")); u.hash = ""; return u.toString().replace(/\/$/, "").toLowerCase(); } catch { return ""; } }
function streamUrl(r: Row) { return String(r.validated_stream_url || r.source_url || r.embed_url || "").trim() || null; }
function koreaSignals(r:Row){
  const blob=`${r.title||""} ${r.channel_name||""} ${r.category||""} ${r.categories||""} ${r.source_type||""} ${r.source_id||""} ${r.source_key||""} ${streamUrl(r)||""}`;
  const signals:string[]=[];
  if(/[\uac00-\ud7af]/u.test(blob)) signals.push("korean_script");
  if(/(?:service_id=|\b)KR(?:BC|BB)?\d/i.test(blob)) signals.push("korean_service_id");
  if(/(?:^|[\/_-])KR(?:[\/_-]|$)|korea|korean|samsung.*kr/i.test(blob)) signals.push("korea_path_or_metadata");
  if(/\b(?:CJENM|JTBC|MBC|SBS|KBS|TVING|NEWID)\b/i.test(blob)) signals.push("korean_broadcaster_or_distributor");
  return [...new Set(signals)];
}
function group<T>(rows: T[], key: (r: T) => string) { const m = new Map<string,T[]>(); for (const r of rows) { const k=key(r); if (!k) continue; const a=m.get(k)||[]; a.push(r); m.set(k,a); } return [...m.entries()].filter(([,a])=>a.length>1).map(([key,items])=>({key,ids:items.map((r:any)=>r.id),titles:items.map((r:any)=>r.title)})); }
function save(file: string, value: unknown) { fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file, JSON.stringify(value,null,2)); }
function read<T>(file:string, fallback:T):T { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file,"utf8")) as T : fallback; }
async function pool<T,R>(items:T[], fn:(x:T)=>Promise<R>) { const out:R[]=[]; let next=0; await Promise.all(Array.from({length:Math.min(concurrency,items.length)},async()=>{ while(next<items.length){ const i=next++; out[i]=await fn(items[i]); }})); return out; }

async function fetchRegions(regions:string[]) {
  const sb=getSupabaseAdmin(); const byId=new Map<string,Row>();
  for (const region of regions) for(let from=0;;from+=1000){
    const {data,error}=await sb.from("tv_videos").select("*").eq("region",region).range(from,from+999);
    if(error) throw error; for(const r of data||[]) byId.set(r.id,r); if(!data||data.length<1000) break;
  }
  return [...byId.values()];
}
async function probe(row:Row):Promise<Probe>{
  const raw=streamUrl(row); const at=new Date().toISOString();
  if(!raw) return {id:row.id,at,url:null,protocol:"unknown",playable:false,reason:"missing_stream_url"};
  if(!validatePublicTvUrl(raw)) return {id:row.id,at,url:raw,protocol:"invalid",playable:false,reason:"unsafe_or_non_public_url"};
  try {
    const protocol=classifyStreamUrl(raw); const direct=await probeStreamUrl(raw,{timeoutMs:20000});
    const health=await probeTvStation({source_url:raw,title:row.title||"Somalia TV audit",source_type:row.source_type});
    const playable=Boolean((direct as any).playable && health.playable);
    return {id:row.id,at,url:raw,protocol:String(protocol.protocol||"unknown"),playable,
      reason:playable?"playable":String((direct as any).reason||health.last_validation_result||"probe_failed"),
      finalUrl:(direct as any).finalUrl||raw,iosPlayable:health.ios_playable,androidPlayable:health.android_playable};
  } catch(e){return {id:row.id,at,url:raw,protocol:"unknown",playable:false,reason:`exception:${String(e).slice(0,180)}`};}
}
async function main(){
  const project=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||"";
  const apply=process.argv.includes("--apply-country-fix");
  console.log(JSON.stringify({mode:apply?"APPLY_COUNTRY_FIX":"READ_ONLY",project,table:"tv_videos"}));
  const rows=await fetchRegions(["SO","Somalia"]); const koreaRows=await fetchRegions(["KR","South Korea","Korea, Republic of"]); const prior:Probe[]=process.argv.includes("--resume")?read<Probe[]>(resultsFile,[]):[]; const done=new Map(prior.map(p=>[p.id,p]));
  let work=rows.filter(r=>!done.has(r.id)); if(limit) work=work.slice(0,limit);
  let completed=0; await pool(work,async r=>{const p=await probe(r);done.set(r.id,p); completed++; if(completed%5===0||completed===work.length) save(resultsFile,[...done.values()]); return p;});
  save(resultsFile,[...done.values()]); const probes=[...done.values()];
  const exactNames=group(rows,r=>normName(r.title||r.channel_name)); const exactUrls=group(rows,r=>normUrl(streamUrl(r)));
  const probable=group(rows,r=>{const n=normName(r.title||r.channel_name); return n.length>=5?n:"";});
  const radioOrVod=rows.filter(r=>/\b(radio|fm|vod|movie|series|clip|podcast)\b/i.test(`${r.title||""} ${r.category||""} ${streamUrl(r)||""}`));
  const weak=rows.filter(r=>!r.official_website&&!r.website&&!r.source_page_url&&!r.source_provenance&&/iptv|playlist|community|unknown/i.test(`${r.source_type||""} ${r.source_id||""} ${r.source_key||""}`));
  const countryEvidence=rows.map(r=>({id:r.id,title:r.title,currentRegion:r.region,signals:koreaSignals(r),sourceType:r.source_type,
    sourceId:r.source_id,urlHost:(()=>{try{return new URL(streamUrl(r)||"").hostname}catch{return null}})()}));
  const highConfidenceKorea=countryEvidence.filter(r=>r.signals.length>=2);
  const krSourceIds=new Set(koreaRows.map(r=>String(r.source_id||"")).filter(Boolean));
  const krUrls=new Set(koreaRows.map(r=>normUrl(streamUrl(r))).filter(Boolean));
  const krNames=new Set(koreaRows.map(r=>normName(r.title||r.channel_name)).filter(Boolean));
  const conflicts=rows.map(r=>({id:r.id,title:r.title,sourceId:r.source_id,url:normUrl(streamUrl(r)),name:normName(r.title||r.channel_name)}))
    .filter(r=>krSourceIds.has(String(r.sourceId||""))||krUrls.has(r.url)||krNames.has(r.name));
  const conflictIds=new Set(conflicts.map(r=>r.id)); const safeMoves=highConfidenceKorea.filter(r=>!conflictIds.has(r.id));
  const publicPlayable=rows.filter(r=>r.status==="approved"&&r.is_active===true&&r.playback_status==="playable"&&!r.quarantined_at&&!r.disabled_at&&r.is_public!==false);
  let applied=0;
  if(apply){
    if(project!=="https://kojcyswxfuikxmqntwye.supabase.co") throw new Error(`Refusing unexpected Supabase project: ${project}`);
    if(probes.length!==rows.length||probes.some(p=>!p.playable)) throw new Error("Refusing move: every Somalia-assigned row must pass the current playback probe.");
    if(safeMoves.length!==rows.length||conflicts.length) throw new Error("Refusing move: destination dedupe gate is not clean.");
    const sb=getSupabaseAdmin();
    for(const move of safeMoves){const {data,error}=await sb.from("tv_videos").update({region:"KR"}).eq("id",move.id).in("region",["SO","Somalia"]).select("id"); if(error)throw error; applied+=(data||[]).length;}
    if(applied!==safeMoves.length) throw new Error(`Expected ${safeMoves.length} updates, applied ${applied}.`);
  }
  const report={at:new Date().toISOString(),mode:apply?"APPLIED_COUNTRY_FIX":"READ_ONLY_DRY_RUN",recordsBefore:rows.length,publicPlayableBefore:publicPlayable.length,
    probed:probes.length,unprocessed:rows.length-probes.length,uniqueChannelIdentities:new Set(rows.map(r=>normName(r.title||r.channel_name)).filter(Boolean)).size,
    exactDuplicateNameGroups:exactNames,probableDuplicateGroups:probable,duplicateStreamUrlGroups:exactUrls,
    radioOrVodSuspects:radioOrVod.map(r=>({id:r.id,title:r.title,category:r.category})),
    unclearProvenanceSuspects:weak.map(r=>({id:r.id,title:r.title,source_type:r.source_type,source_id:r.source_id})),
    playback:{playable:probes.filter(p=>p.playable).length,failed:probes.filter(p=>!p.playable).length,failures:probes.filter(p=>!p.playable)},
    countryAssignment:{existingKoreaRows:koreaRows.length,highConfidenceKoreaCount:highConfidenceKorea.length,destinationConflicts:conflicts,safeMoveCount:safeMoves.length,evidence:countryEvidence},
    appliedWrites:applied,proposedWrites:safeMoves.map(r=>({id:r.id,operation:"move_region",from:"SO",to:"KR",reason:r.signals.join(",")})),
    note:"Dry-run only. Proposed SO→KR moves require review; no database rows were changed."};
  save(reportFile,report); console.log(JSON.stringify({reportFile,...report,exactDuplicateNameGroups:exactNames.length,probableDuplicateGroups:probable.length,duplicateStreamUrlGroups:exactUrls.length,radioOrVodSuspects:radioOrVod.length,unclearProvenanceSuspects:weak.length},null,2));
}
main().catch(e=>{console.error(e);process.exit(1)});
