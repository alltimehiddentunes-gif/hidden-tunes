import { isIP } from "node:net";
import type { Platform, ShareSource } from "./types";
export const SHARE_ACTION_NAMES = ["share_open", "share_copy_link", "share_native", "share_whatsapp", "share_facebook", "share_x", "share_telegram", "share_email", "share_sms", "share_qr_view", "share_qr_download"] as const;
export const SHARE_EVENT_NAMES = [...SHARE_ACTION_NAMES, "install_link_open", "share_link_open"] as const;
export const EVENT_NAMES = ["page_view", "cta_click", "command_copy", ...SHARE_EVENT_NAMES] as const;
export const SHARE_SOURCES = ["download_center", "install_landing", "share", "unknown"] as const;
export const CHANNEL_PLATFORMS: Record<string, string> = {
 android_direct:"android",google_play:"android",amazon_fire:"fire",huawei:"android",samsung:"android",
 windows_direct:"windows",microsoft_store:"windows",winget:"windows",chocolatey:"windows",scoop:"windows",
 macos_direct:"macos",homebrew:"macos",linux_appimage:"linux",linux_deb:"linux",snap:"linux",flathub:"linux",aur:"linux",apple_app_store:"ios",unknown:"unknown",
};
export const MAX_BODY_BYTES = 32768;
export const MAX_BATCH = 32;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const token = /^[a-z0-9_-]{1,64}$/i;
const version = /^[0-9][a-z0-9.+_-]{0,31}$/i;
const fields = new Set(["id","name","occurred_at","platform","channel","version","campaign","referrer","share_source"]);
const referrals = new Set(["direct","google","tiktok","instagram","youtube","facebook","x","qr","organic","other","share","native","whatsapp","telegram","email","sms"]);
export type WebsiteEvent = {
 id:string; name:typeof EVENT_NAMES[number]; occurred_at:string; platform:Platform; channel:string;
 version:string|null; campaign:string|null; referrer:string|null; share_source?:ShareSource;
};
export class ValidationError extends Error {}
export function validateBatch(body:unknown, now=Date.now()):WebsiteEvent[] {
 if (!body || typeof body!=="object" || Array.isArray(body) || Object.keys(body).some(k=>k!=="events")) throw new ValidationError("Invalid envelope");
 const events=(body as {events?:unknown}).events;
 if(!Array.isArray(events)||events.length<1||events.length>MAX_BATCH) throw new ValidationError("Invalid batch size");
 return events.map((value):WebsiteEvent=>{
  if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).some(k=>!fields.has(k))) throw new ValidationError("Unexpected event fields");
  const e=value as Record<string,unknown>;
  if(typeof e.id!=="string"||!uuid.test(e.id)) throw new ValidationError("Invalid event ID");
  if(typeof e.name!=="string"||!EVENT_NAMES.includes(e.name as WebsiteEvent["name"])) throw new ValidationError("Unsupported event");
  if(typeof e.occurred_at!=="string"||!/^\d{4}-\d{2}-\d{2}T/.test(e.occurred_at)) throw new ValidationError("Invalid timestamp");
  const when=Date.parse(e.occurred_at);
  if(!Number.isFinite(when)||when>now+60000||when<now-86400000) throw new ValidationError("Timestamp out of bounds");
  if(typeof e.channel!=="string"||!Object.hasOwn(CHANNEL_PLATFORMS,e.channel)) throw new ValidationError("Invalid channel");
  const isShare=(SHARE_EVENT_NAMES as readonly string[]).includes(e.name);
  const isShareAction=(SHARE_ACTION_NAMES as readonly string[]).includes(e.name);
  const genericWeb=(e.name==="page_view"||isShareAction||e.name==="share_link_open")&&e.channel==="unknown"&&e.platform==="web";
  const genericLinux=e.name==="install_link_open"&&e.channel==="unknown"&&e.platform==="linux";
  if(genericLinux&&e.version!=null) throw new ValidationError("Generic Linux version must be unknown");
  if(typeof e.platform!=="string"||!genericWeb&&!genericLinux&&e.platform!==CHANNEL_PLATFORMS[e.channel]) throw new ValidationError("Channel/platform mismatch");
  if(e.name!=="page_view"&&!isShareAction&&e.name!=="share_link_open"&&!genericLinux&&e.channel==="unknown") throw new ValidationError("Observation requires a channel");
  if(e.name==="page_view"&&(e.channel!=="unknown"||e.platform!=="web")) throw new ValidationError("Page views are website observations");
  if(isShare) {
   if(typeof e.share_source!=="string"||!(SHARE_SOURCES as readonly string[]).includes(e.share_source)) throw new ValidationError("Invalid share source");
   if(e.name==="install_link_open"&&e.share_source!=="share"&&e.share_source!=="unknown") throw new ValidationError("Invalid install-link source");
   if(e.name==="share_link_open"&&(e.share_source!=="share"||e.channel!=="unknown"||e.platform!=="web"||e.version!=null)) throw new ValidationError("Invalid download-center arrival");
   if(isShareAction&&e.share_source!=="download_center"&&e.share_source!=="install_landing") throw new ValidationError("Invalid share action context");
  } else if(Object.hasOwn(e,"share_source")) throw new ValidationError("Unexpected share source");
  if(e.name==="command_copy"&&!["homebrew","scoop","winget","chocolatey","snap","flathub","aur"].includes(e.channel)) throw new ValidationError("Unsupported command channel");
  for(const [key,pattern] of [["version",version],["campaign",token]] as const) {
   if(e[key]!=null&&(typeof e[key]!=="string"||!pattern.test(e[key] as string))) throw new ValidationError("Invalid "+key);
  }
  if(isShare&&typeof e.campaign==="string"&&(/[^a-z0-9_-]/i.test(e.campaign)||/^\d{7,}$/.test(e.campaign)||/^(?:\d{1,3}[-_]){3}\d{1,3}$/.test(e.campaign))) throw new ValidationError("Invalid share campaign");
  if(typeof e.version==="string" && isIP(e.version)) throw new ValidationError("Invalid version");
  if(e.referrer!=null&&(typeof e.referrer!=="string"||!referrals.has(e.referrer))) throw new ValidationError("Invalid referrer category");
  return {id:e.id,name:e.name as WebsiteEvent["name"],occurred_at:new Date(when).toISOString(),platform:e.platform as Platform,channel:e.channel,version:(e.version??null) as string|null,campaign:(e.campaign??null) as string|null,referrer:(e.referrer??null) as string|null,...(isShare?{share_source:e.share_source as ShareSource}:{})};
 });
}
export const ALLOWED_ORIGINS = new Set(["https://hiddentunes.com","https://www.hiddentunes.com"]);
export async function readBoundedJson(request:Request):Promise<unknown> {
 const declared=Number(request.headers.get("content-length"));
 if(Number.isFinite(declared)&&declared>MAX_BODY_BYTES) throw new ValidationError("Payload too large");
 const reader=request.body?.getReader();
 if(!reader) throw new ValidationError("Missing body");
 let size=0; const chunks:Uint8Array[]=[];
 let timeout: ReturnType<typeof setTimeout> | undefined;
 const deadline=new Promise<never>((_resolve,reject)=>{timeout=setTimeout(()=>{void reader.cancel().catch(()=>{});reject(new ValidationError("Body read timed out"));},3000);});
 try {
  for(;;) {
   const {done,value}=await Promise.race([reader.read(),deadline]); if(done) break;
   size+=value.byteLength;
   if(size>MAX_BODY_BYTES) {await reader.cancel();throw new ValidationError("Payload too large");}
   chunks.push(value);
  }
 } finally {if(timeout)clearTimeout(timeout);reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));}
 catch{throw new ValidationError("Invalid JSON");}
}
