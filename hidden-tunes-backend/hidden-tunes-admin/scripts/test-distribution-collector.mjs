import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
const script=readFileSync(new URL('../public/distribution-analytics.js',import.meta.url),'utf8');
function boot({path='/download',search='?campaign=apk_poster_01&utm_medium=qr&token=DO_NOT_SEND',dnt='0',gpc=false,fail=false}={}){
 const listeners={},documentListeners={},timers=[],requests=[];
 const location={pathname:path,search};
 const document={referrer:'https://google.com/search?q=PRIVATE',visibilityState:'visible',addEventListener:(name,fn)=>documentListeners[name]=fn};
 const window={location,crypto:{randomUUID},addEventListener:(name,fn)=>listeners[name]=fn};
 window.window=window;
 const context={window,document,navigator:{doNotTrack:dnt,globalPrivacyControl:gpc},location,crypto:window.crypto,URL,URLSearchParams,Date,Set,console,
 setInterval:fn=>{listeners.interval=fn;return 1;},setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout:()=>{},
 fetch:(url,options)=>{requests.push({url,...options});return fail?Promise.reject(new Error('offline')):Promise.resolve({ok:true,status:202});}};
 vm.runInNewContext(script,context);
 return {listeners,documentListeners,timers,requests,window,document,location};
}
async function settle(){await new Promise(resolve=>setImmediate(resolve));}
const s=boot();assert.equal(s.requests.length,0);s.timers[0]();await settle();
assert.equal(s.requests.length,1);
const first=JSON.parse(s.requests[0].body).events[0];
assert.equal(first.name,'page_view');assert.equal(first.platform,'web');assert.equal(first.channel,'unknown');assert.equal(first.campaign,'apk_poster_01');
assert.equal(first.referrer,'qr');assert.ok(!s.requests[0].body.includes('PRIVATE'));assert.ok(!s.requests[0].body.includes('DO_NOT_SEND'));
assert.equal(s.requests[0].credentials,'omit');
s.listeners['hidden-tunes-distribution-cta']({detail:{channel:'android_direct',action:'click',version:'1.0.2'}});
s.listeners['hidden-tunes-distribution-cta']({detail:{channel:'homebrew',action:'copy_command',version:'1.0.1'}});
s.listeners.pagehide();await settle();
assert.deepEqual(JSON.parse(s.requests[1].body).events.map(e=>e.name),['cta_click','command_copy']);
const count=s.requests.length;s.location.pathname='/music';s.listeners.interval();s.listeners['hidden-tunes-distribution-cta']({detail:{channel:'android_direct',action:'click'}});
s.listeners.pagehide();await settle();assert.equal(s.requests.length,count);
for(const privacy of [{dnt:'1'},{gpc:true}]){const p=boot(privacy);assert.equal(Object.keys(p.listeners).length,0);assert.equal(p.requests.length,0);}
const noRoute=boot({path:'/tv'});assert.equal(noRoute.timers.length,0);assert.equal(noRoute.requests.length,0);
const offline=boot({fail:true});for(let i=0;i<200;i++)offline.listeners['hidden-tunes-distribution-cta']({detail:{channel:'android_direct',action:'click'}});
await settle();assert.ok(offline.requests.every(r=>JSON.parse(r.body).events.length<=32));assert.equal(offline.requests.length,1);
console.log('PASS collector batching, page scope, anonymous payload, click/copy separation, privacy preferences, bounded offline behavior');
const shares=boot({search:'?src=share&campaign=launch_01&message=PRIVATE&token=DO_NOT_SEND'});
shares.listeners.pagehide();await settle();
let received=JSON.parse(shares.requests[0].body).events;
assert.deepEqual(received.map(e=>e.name),['page_view','share_link_open']);
assert.equal(received[1].share_source,'share');assert.equal(received[1].platform,'web');assert.equal(received[1].channel,'unknown');assert.equal(received[1].version,null);
shares.listeners.interval();shares.listeners.pagehide();await settle();assert.equal(shares.requests.length,1,'same visible arrival is not counted repeatedly');
for(const action of ['open','copy_link','native','whatsapp','facebook','x','telegram','email','sms','qr_view','qr_download']) {
 shares.listeners['hidden-tunes-distribution-share']({detail:{action,channel:'android_direct',version:'1.0.2',context:'download_center',message:'PRIVATE',recipient:'PRIVATE'}});
}
shares.listeners.pagehide();await settle();
received=JSON.parse(shares.requests[1].body).events;
assert.deepEqual(received.map(e=>e.name),['share_open','share_copy_link','share_native','share_whatsapp','share_facebook','share_x','share_telegram','share_email','share_sms','share_qr_view','share_qr_download']);
assert.ok(received.every(e=>e.share_source==='download_center'&&e.campaign==='launch_01'&&e.referrer==='share'));
assert.ok(shares.requests.every(r=>!r.body.includes('PRIVATE')&&!r.body.includes('DO_NOT_SEND')));
shares.listeners['hidden-tunes-distribution-share']({detail:{action:'open',channel:'unknown',version:'1.0.1',context:'download_center'}});
shares.listeners['hidden-tunes-distribution-share']({detail:{action:'sent',channel:'android_direct',context:'download_center'}});
shares.listeners['hidden-tunes-distribution-share']({detail:{action:'open',channel:'android_direct',context:'https://private.test'}});
shares.listeners.pagehide();await settle();
received=JSON.parse(shares.requests[2].body).events;assert.equal(received.length,1);assert.equal(received[0].platform,'web');assert.equal(received[0].version,null);
const packageLanding=boot({search:'?install=homebrew&src=share&campaign=launch_01'});
packageLanding.listeners.pagehide();await settle();
assert.deepEqual(JSON.parse(packageLanding.requests[0].body).events.map(e=>e.name),['page_view'],'PHP already observed the /get request');
packageLanding.listeners['hidden-tunes-distribution-share']({detail:{action:'copy_link',channel:'homebrew',version:'1.0.1',context:'install_landing'}});
packageLanding.listeners.pagehide();await settle();assert.equal(JSON.parse(packageLanding.requests[1].body).events[0].share_source,'install_landing');
const redirect=boot({path:'/get/android',search:'?src=share'});assert.equal(redirect.requests.length,0);assert.equal(redirect.timers.length,0,'collector never duplicates PHP redirect observations');
console.log('PASS share method contract, top-level tagged arrivals, package-landing deduplication and private-field exclusion');
for(const search of ['?src=share&campaign=1234567','?src=share&campaign=192_168_1_1','?src=share&campaign=192-168-1-1','?src=share&campaign=safe%0A','?src=share&campaign=&campaign=second','?src=share&utm_campaign=one&utm_campaign=two','?src=share&campaign='+ 'a'.repeat(1024)]){
 const sanitized=boot({search});sanitized.listeners.pagehide();await settle();
 assert.ok(JSON.parse(sanitized.requests[0].body).events.every(e=>e.campaign===null),search);
}
const fallback=boot({search:'?src=share&campaign=&campaign=discard&utm_campaign=approved_01'});fallback.listeners.pagehide();await settle();
assert.ok(JSON.parse(fallback.requests[0].body).events.every(e=>e.campaign==='approved_01'));
const duplicateSource=boot({search:'?src=share&src=share'});duplicateSource.listeners.pagehide();await settle();
assert.deepEqual(JSON.parse(duplicateSource.requests[0].body).events.map(e=>e.name),['page_view']);
console.log('PASS bounded attribution, duplicate-parameter rejection and numeric/IP-like campaign exclusion');
