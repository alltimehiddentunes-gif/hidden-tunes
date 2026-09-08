const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
let status='active', revision=3, video=true, metadata=true, calls=[], race=false;
const target={platform:'ios',nativeBuild:'1.0.216',bundleId:'com.hiddentunes.app',profile:'IOS_216'};
const identityHeaders={'x-ht-platform':'ios','x-ht-native-build':'1.0.216','x-ht-bundle-id':'com.hiddentunes.app','x-ht-policy-profile':'IOS_216'};
const policy={ IOS_OPERATIONAL_PLATFORM:true, iosOperationalRequestHeaders:()=>identityHeaders, isIos216PolicyTarget:value=>JSON.stringify(value)===JSON.stringify(target), refreshIosOperationalPolicy:async()=>({status,revision}), getIosOperationalPolicySnapshot:()=>({status,revision}), iosOperationalControlEnabled:id=>id.endsWith('sports-video')?video:metadata };
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname,'../services/iosSportsPolicy.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
 module:mod,exports:mod.exports,require:name=>{assert.equal(name,'./iosOperationalPolicy');return policy;},URL,Headers,
 fetch:async(url,init)=>{calls.push({url,init}); if(url.includes('/api/ios/'))for(const [key,value]of Object.entries(identityHeaders))assert.equal(init.headers.get(key),value); const issued=revision; if(race)revision++;return{ok:true,status:200,clone:()=>({json:async()=>({iosOperational:{policyTarget:target,enforcementEnabled:true,revision:issued}})})};},
});
async function main(){
 const api=mod.exports;
 const card={id:'fixture',watchability:{playable:true,state:'watch'},availabilityState:'live_in_app',watchAction:'native',watchLabel:'Watch Live',broadcasts:[{id:'b'}]};
 assert.equal(api.filterIosSportsPayload(card),card);
 video=false;
 const filtered=api.filterIosSportsPayload(card);
 assert.equal(filtered.id,'fixture');assert.equal(filtered.watchability.playable,false);assert.equal(filtered.availabilityState,'live_unavailable');assert.equal(filtered.watchAction,'unavailable');assert.equal(filtered.broadcasts.length,0);
 assert.equal(card.watchability.playable,true,'original cached metadata untouched');
 assert.equal(filtered.watchability.access,null);assert.equal(filtered.watchLabel,'Stream unavailable');
 await api.assertIosSportsAvailability(false);await assert.rejects(api.assertIosSportsAvailability(true));
 const url='https://admin.hiddentunes.com/api/sports/fixtures/fixture/play';
 await assert.rejects(api.fetchIosSportsPlayback(url,{method:'POST',body:JSON.stringify({platform:'ios',country:'DE'})}));assert.equal(calls.length,0);
 video=true;metadata=false;await api.assertIosSportsAvailability(true);await assert.rejects(api.assertIosSportsAvailability(false));
 const init={method:'POST',body:JSON.stringify({platform:'android',country:'DE'})};
 await api.fetchIosSportsPlayback(url,init);
 assert.equal(calls[0].url,'https://admin.hiddentunes.com/api/ios/sports/play/sports_fixture/fixture');assert.deepEqual(JSON.parse(calls[0].init.body),{country:'DE'});assert.match(init.body,/android/,'original request retained');
 await api.fetchIosSportsPlayback('https://admin.hiddentunes.com/api/sports/playback-sessions/opaque',{method:'GET'});assert.match(calls[1].url,/\/api\/ios\/sports\/sessions\/opaque$/);
 race=true;await assert.rejects(api.fetchIosSportsPlayback(url,init),/changed/);race=false;
 status='unavailable';await assert.rejects(api.fetchIosSportsPlayback(url,init));
 status='legacy';const before=calls.length;await api.fetchIosSportsPlayback(url,init);assert.equal(calls[before].url,url);assert.equal(calls[before].init,init);
 assert.equal(api.filterIosSportsPayload(card),card);
 status='active';policy.IOS_OPERATIONAL_PLATFORM=false;await api.fetchIosSportsPlayback(url,init);assert.equal(calls.at(-1).url,url);assert.equal(calls.at(-1).init,init);
 console.log('PASS: Sports metadata/video independence, cached watch affordance revocation, fixed iOS play/session routes, no platform body override, stale revision rejection, legacy/non-iOS request identity. Offline only.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
