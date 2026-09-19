import { getDesktopAccountClient } from './desktopSupabaseAuth'

const INSTALLATION_KEY='hidden-tunes.crossplay.installation.v1'
const LAST_SEEN_KEY='hidden-tunes.crossplay.last-seen.v1'
export type CrossplayContentType='music'|'podcast'|'audiobook'|'lecture'|'motivational'|'radio'|'tv'
export type ContinueItem={content_type:CrossplayContentType;content_id:string;item_id:string;position_ms:number|null;duration_ms:number|null;completion_state:string;version:number;updated_at:string;safe_metadata:Record<string,unknown>;user_devices?:{device_name:string;platform:string}|null}
function randomId(){const b=new Uint8Array(24);crypto.getRandomValues(b);return Array.from(b,x=>x.toString(16).padStart(2,'0')).join('')}
export function desktopInstallationId(){let id=localStorage.getItem(INSTALLATION_KEY);if(!id){id=randomId();localStorage.setItem(INSTALLATION_KEY,id)}return id}
export function clearDesktopCrossplayAccountCache(){sessionStorage.removeItem('hidden-tunes.crossplay.continue.v1')}
export async function registerDesktopDevice(name='Windows Desktop'){
 const client=getDesktopAccountClient();if(!client)return null
 const last=Number(localStorage.getItem(LAST_SEEN_KEY)||0);if(Date.now()-last<15*60_000)return null
 const {data,error}=await client.rpc('crossplay_register_device',{p_public_id:desktopInstallationId(),p_name:name,p_platform:'desktop',p_class:'computer',p_app_version:'phase-a',p_capabilities:{continueAnywhere:true,receiveHandoff:false,remoteTarget:false}})
 if(error)throw error;localStorage.setItem(LAST_SEEN_KEY,String(Date.now()));return data
}
export async function listContinueAnywhere(limit=8):Promise<ContinueItem[]>{const client=getDesktopAccountClient();if(!client)return[];const {data,error}=await client.from('playback_progress').select('content_type,content_id,item_id,position_ms,duration_ms,completion_state,version,updated_at,safe_metadata,user_devices!playback_progress_last_device_id_fkey(device_name,platform)').eq('completion_state','in_progress').order('updated_at',{ascending:false}).limit(Math.min(8,Math.max(1,limit)));if(error)throw error;return(data||[]) as unknown as ContinueItem[]}
export async function writeDesktopProgress(input:{deviceId:string;type:CrossplayContentType;contentId:string;itemId?:string;positionMs:number|null;durationMs:number|null;completion?:'in_progress'|'completed';expectedVersion:number;metadata?:Record<string,unknown>}){const client=getDesktopAccountClient();if(!client)return null;const {data,error}=await client.rpc('crossplay_write_progress',{p_device_id:input.deviceId,p_content_type:input.type,p_content_id:input.contentId,p_item_id:input.itemId||'',p_position_ms:input.positionMs,p_duration_ms:input.durationMs,p_completion:input.completion||'in_progress',p_expected_version:input.expectedVersion,p_metadata:input.metadata||{}});if(error)throw error;return data}
export async function revokeDesktopDevice(deviceId:string){const client=getDesktopAccountClient();if(!client)return;const{error}=await client.rpc('crossplay_revoke_device',{p_device_id:deviceId});if(error)throw error}
export async function dismissDesktopContinuation(item:Pick<ContinueItem,'content_type'|'content_id'|'item_id'|'version'>){const client=getDesktopAccountClient();if(!client)return;const{error}=await client.rpc('crossplay_dismiss_progress',{p_content_type:item.content_type,p_content_id:item.content_id,p_item_id:item.item_id,p_expected_version:item.version});if(error)throw error}
export function safeResumeMs(type:CrossplayContentType,position:number,duration:number|null){if(type==='radio'||type==='tv')return null;if(duration!==null&&duration<30_000)return 0;return Math.max(0,position-((type==='podcast'||type==='audiobook'||type==='lecture')?10_000:type==='music'?3_000:5_000))}
