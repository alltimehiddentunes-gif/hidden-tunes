export const LOCAL_CROSSPLAY_ORIGIN='http://127.0.0.1:55432' as const
export type LocalCrossplayConfig={enabled:boolean;reason:string;origin:string;identity:string;jwt:string}
type Env=Record<string,string|boolean|undefined>
export function resolveLocalCrossplayConfig(env:Env):LocalCrossplayConfig{
 const off=(reason:string):LocalCrossplayConfig=>({enabled:false,reason,origin:'',identity:'',jwt:''})
 if(env.VITE_CROSSPLAY_ENABLED!=='true')return off('flag_disabled')
 if(env.DEV!==true||env.PROD===true)return off('non_development_runtime')
 if(!['development','test'].includes(String(env.MODE||'')))return off('preview_or_unknown_mode')
 if(env.VITE_CROSSPLAY_LOCAL_ENDPOINT!==LOCAL_CROSSPLAY_ORIGIN)return off('endpoint_not_pinned')
 if(!['fixture-mobile','fixture-desktop'].includes(String(env.VITE_CROSSPLAY_LOCAL_IDENTITY||'')))return off('fixture_identity_missing')
 if(!String(env.VITE_CROSSPLAY_LOCAL_JWT||'').trim())return off('fixture_jwt_missing')
 return{enabled:true,reason:'local_only',origin:LOCAL_CROSSPLAY_ORIGIN,identity:String(env.VITE_CROSSPLAY_LOCAL_IDENTITY),jwt:String(env.VITE_CROSSPLAY_LOCAL_JWT)}
}
export function assertPinnedLocalUrl(origin:string,path:string){const base=new URL(origin);if(base.protocol!=='http:'||base.hostname!=='127.0.0.1'||base.port!=='55432'||base.username||base.password||base.origin!==LOCAL_CROSSPLAY_ORIGIN)throw new Error('Cross Play local endpoint rejected');const url=new URL(path,base);if(url.origin!==LOCAL_CROSSPLAY_ORIGIN)throw new Error('Cross Play request escaped loopback');return url.toString()}
export class LocalCrossplayClient{
 private readonly config:LocalCrossplayConfig
 private readonly request:typeof fetch
 constructor(config:LocalCrossplayConfig,request:typeof fetch=fetch){this.config=config;this.request=request;if(!config.enabled)throw new Error('Cross Play local runtime disabled')}
 private async call(path:string,init:RequestInit={}){const url=assertPinnedLocalUrl(this.config.origin,path);const response=await this.request(url,{...init,redirect:'manual',headers:{Authorization:`Bearer ${this.config.jwt}`,'Content-Type':'application/json',...(init.headers||{})}});if(response.type==='opaqueredirect'||response.status>=300&&response.status<400)throw new Error('Cross Play redirect rejected');if(!response.ok)throw new Error(`Cross Play local request failed (${response.status})`);if(response.status===204)return null;return response.json()}
 registerDevice(input:{publicId:string;name:string;platform:'mobile'|'desktop';deviceClass:'phone'|'tablet'|'computer'}){return this.call('/rpc/crossplay_register_device',{method:'POST',body:JSON.stringify({p_public_id:input.publicId,p_name:input.name.slice(0,80),p_platform:input.platform,p_class:input.deviceClass,p_app_version:'local-harness',p_capabilities:{continueAnywhere:true,localTestOnly:true}})})}
 listContinuations(){return this.call('/playback_progress?completion_state=eq.in_progress&order=updated_at.desc&limit=6')}
 writeProgress(input:{deviceId:string;type:string;contentId:string;positionMs:number|null;durationMs:number|null;expectedVersion:number}){const live=input.type==='radio'||input.type==='tv';return this.call('/rpc/crossplay_write_progress',{method:'POST',body:JSON.stringify({p_device_id:input.deviceId,p_content_type:input.type,p_content_id:input.contentId,p_item_id:'',p_position_ms:live?null:input.positionMs,p_duration_ms:live?null:input.durationMs,p_completion:'in_progress',p_expected_version:input.expectedVersion,p_metadata:{localFixture:true}})})}
}
export function currentLocalCrossplayConfig(){return resolveLocalCrossplayConfig(import.meta.env as unknown as Env)}
