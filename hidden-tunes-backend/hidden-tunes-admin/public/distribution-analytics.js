/* Hidden Tunes download-page observations only. No cookie, local storage, user ID or fingerprint. */
(function () {
 "use strict";
 if(window.__hiddenTunesDistributionCollector) return;
 if(navigator.globalPrivacyControl===true||navigator.doNotTrack==="1"||window.doNotTrack==="1") return;
 window.__hiddenTunesDistributionCollector=true;
 var endpoint="https://admin.hiddentunes.com/api/analytics/events";
 var queue=[],busy=false,attempt=0,timer=null,lastPath=null,lastSharedArrival=null;
 var platform={android_direct:"android",google_play:"android",amazon_fire:"fire",huawei:"android",samsung:"android",windows_direct:"windows",microsoft_store:"windows",winget:"windows",chocolatey:"windows",scoop:"windows",macos_direct:"macos",homebrew:"macos",linux_appimage:"linux",linux_deb:"linux",snap:"linux",flathub:"linux",aur:"linux",apple_app_store:"ios"};
 function active(){return /^\/download(?:\/android)?\/?$/.test(location.pathname);}
 var shareActions={open:"share_open",copy_link:"share_copy_link",native:"share_native",whatsapp:"share_whatsapp",facebook:"share_facebook",x:"share_x",telegram:"share_telegram",email:"share_email",sms:"share_sms",qr_view:"share_qr_view",qr_download:"share_qr_download"};
 function safeQuery(){
  var raw=location.search.charAt(0)==="?"?location.search.slice(1):location.search,out={};
  if(raw.length>1024)return out;
  var q=new URLSearchParams(raw);
  ["src","campaign","utm_source","utm_medium","utm_campaign"].forEach(function(key){
   var values=q.getAll(key);if(values.length!==1)return;
   var value=values[0];
   if(key==="src"){if(value==="share")out[key]=value;return;}
   if(/^[a-z0-9_-]{1,64}$/i.test(value)&&!/[^a-z0-9_-]/i.test(value)&&!/^\d{7,}$/.test(value)&&!/^(?:\d{1,3}[-_]){3}\d{1,3}$/.test(value))out[key]=value;
  });
  return out;
 }
 function attribution(){
  var q=safeQuery(),c=q.campaign||q.utm_campaign||null;
  var host="";try{host=new URL(document.referrer).hostname.toLowerCase();}catch(_){}
  var r="direct";
  if(host){r="other";var categories={google:/(^|\.)google\.[a-z.]+$/,tiktok:/(^|\.)tiktok\.com$/,instagram:/(^|\.)instagram\.com$/,youtube:/(^|\.)youtube\.com$|^youtu\.be$/,facebook:/(^|\.)facebook\.com$/,x:/^(www\.)?(x|twitter|t)\.(com|co)$/};
   Object.keys(categories).some(function(k){if(categories[k].test(host)){r=k;return true;}return false;});
  }
  if(q.utm_medium==="qr") r="qr";
  if(q.src==="share")r="share";
  return {campaign:c,referrer:r};
 }
 function schedule(delay){if(timer) clearTimeout(timer);timer=setTimeout(function(){timer=null;flush();},delay);}
 function add(name,channel,version,shareSource){
  try{
   if(!active()||!window.crypto||!crypto.randomUUID) return;
   var a=attribution(),e={id:crypto.randomUUID(),name:name,occurred_at:new Date().toISOString(),platform:name==="page_view"||channel==="unknown"?"web":platform[channel],channel:name==="page_view"?"unknown":channel,version:typeof version==="string"&&/^[0-9][a-z0-9.+_-]{0,31}$/i.test(version)?version:null,campaign:a.campaign,referrer:a.referrer};
   if(shareSource)e.share_source=shareSource;
   if(!e.platform) return;
   if(queue.length>=64) queue.shift();
   queue.push(e);if(queue.length>=16) flush();else if(!timer) schedule(15000);
  }catch(_){}
 }
 function flush(){
  if(busy||!queue.length) return;
  busy=true;var batch=queue.slice(0,32);
  try{
   fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({events:batch}),credentials:"omit",mode:"cors",keepalive:true})
   .then(function(res){if(res.ok||(res.status>=400&&res.status<500&&res.status!==429)){var ids=new Set(batch.map(function(e){return e.id;}));queue=queue.filter(function(e){return !ids.has(e.id);});attempt=0;}else{attempt=Math.min(attempt+1,5);}})
   .catch(function(){attempt=Math.min(attempt+1,5);})
   .finally(function(){busy=false;queue=queue.filter(function(e){return Date.now()-Date.parse(e.occurred_at)<3600000;});if(queue.length)schedule(Math.min(300000,15000*Math.pow(2,attempt)));});
  }catch(_){busy=false;schedule(60000);}
 }
 function view(){
  try{
   if(document.visibilityState==="hidden")return;
   var path=active()?location.pathname:null;
   if(path!==lastPath){lastPath=path;if(path)add("page_view","unknown",null);}
   // /get requests are observed by the redirect handler; never duplicate package landings.
   var q=safeQuery();
   var shared=path&&/^\/download\/?$/.test(path)&&q.src==="share"&&!new URLSearchParams(location.search).has("install")?path:null;
   if(shared!==lastSharedArrival){lastSharedArrival=shared;if(shared)add("share_link_open","unknown",null,"share");}
  }catch(_){}
 }
 window.addEventListener("hidden-tunes-distribution-cta",function(event){
  try{var d=event.detail;if(!d||!Object.prototype.hasOwnProperty.call(platform,d.channel))return;
   if(d.action==="click")add("cta_click",d.channel,d.version);
   else if(d.action==="copy_command")add("command_copy",d.channel,d.version);
  }catch(_){}
 });
 window.addEventListener("hidden-tunes-distribution-share",function(event){
  try{var d=event.detail;if(!d||!Object.prototype.hasOwnProperty.call(shareActions,d.action))return;
   if(d.context!=="download_center"&&d.context!=="install_landing")return;
   if(d.channel!=="unknown"&&!Object.prototype.hasOwnProperty.call(platform,d.channel))return;
   add(shareActions[d.action],d.channel,d.channel==="unknown"?null:d.version,d.context);
  }catch(_){}
 });
 window.addEventListener("popstate",view);
 window.addEventListener("pagehide",flush);
 document.addEventListener("visibilitychange",function(){if(document.visibilityState==="hidden")flush();else view();});
 // Observe existing SPA route changes without intercepting history or navigation.
 setInterval(view,2000);view();
})();
