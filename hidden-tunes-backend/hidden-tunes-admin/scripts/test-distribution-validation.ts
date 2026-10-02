import assert from "node:assert/strict";
import {readBoundedJson,validateBatch,MAX_BODY_BYTES} from "../lib/distribution/validation";
const now=Date.parse("2026-09-08T12:00:00Z");
const valid={id:"fef76da8-eac1-4b99-a036-c73b74ef1e75",name:"cta_click",occurred_at:"2026-09-08T11:59:00Z",platform:"android",channel:"android_direct",version:"1.0.2",campaign:"apk_poster_01",referrer:"qr"};
assert.equal(validateBatch({events:[valid]},now)[0].name,"cta_click");
for(const patch of [{version:"192.168.1.1"},{name:"artifact_request"},{name:"first_launch"},{user_id:"someone"},{ip:"1.2.3.4"},{url:"https://example.com/secret"},{stream_url:"secret"},{authorization:"secret"},{campaign:"person@example.com"},{referrer:"https://private.example/path"},{channel:"homebrew",platform:"android"},{occurred_at:"2026-09-10T00:00:00Z"},{occurred_at:"2026-09-01T00:00:00Z"},{id:"not-uuid"}]){
 assert.throws(()=>validateBatch({events:[{...valid,...patch}]},now));
}
assert.throws(()=>validateBatch({events:Array(33).fill(valid)},now));
assert.throws(()=>validateBatch({events:[valid],extra:1},now));
assert.throws(()=>validateBatch({events:[]},now));
assert.equal(validateBatch({events:[{...valid,name:"page_view",platform:"web",channel:"unknown"}]},now)[0].platform,"web");
const shareNames=["share_open","share_copy_link","share_native","share_whatsapp","share_facebook","share_x","share_telegram","share_email","share_sms","share_qr_view","share_qr_download"];
for(const name of shareNames) {
 assert.equal(validateBatch({events:[{...valid,name,share_source:"download_center"}]},now)[0].name,name);
 assert.equal(validateBatch({events:[{...valid,name,channel:"unknown",platform:"web",version:null,share_source:"download_center"}]},now)[0].platform,"web");
 assert.throws(()=>validateBatch({events:[{...valid,name}]},now));
}
const arrival={...valid,name:"install_link_open",share_source:"share",referrer:"share"};
assert.equal(validateBatch({events:[arrival]},now)[0].share_source,"share");
assert.equal(validateBatch({events:[{...arrival,channel:"unknown",platform:"linux",version:null}]},now)[0].platform,"linux");
assert.equal(validateBatch({events:[{...arrival,name:"share_link_open",channel:"unknown",platform:"web",version:null}]},now)[0].name,"share_link_open");
for(const patch of [{share_source:"person@example.com"},{message:"PRIVATE"},{recipient:"PRIVATE"},{src:"share"},{share_source:"install_landing"},{channel:"unknown",platform:"web"}])assert.throws(()=>validateBatch({events:[{...arrival,...patch}]},now));
assert.throws(()=>validateBatch({events:[{...arrival,name:"share_link_open"}]},now));
assert.throws(()=>validateBatch({events:[{...valid,share_source:"share"}]},now));
assert.throws(()=>validateBatch({events:[{...valid,name:"share_sent",share_source:"download_center"}]},now));
for(const campaign of ["1234567","192_168_1_1","192-168-1-1","safe\n"])assert.throws(()=>validateBatch({events:[{...arrival,campaign}]},now));
assert.equal(validateBatch({events:[{...valid,campaign:"1234567"}]},now)[0].campaign,"1234567","legacy validation/hashes remain stable");
assert.deepEqual(validateBatch({events:[valid]},now)[0],{...valid,occurred_at:"2026-09-08T11:59:00.000Z"},"legacy normalized envelope remains unchanged for deduplication");
async function main(){
 await assert.rejects(()=>readBoundedJson(new Request("https://example.test",{method:"POST",body:"x".repeat(MAX_BODY_BYTES+1)})));
 await assert.rejects(()=>readBoundedJson(new Request("https://example.test",{method:"POST",body:"{"})));
 assert.deepEqual(await readBoundedJson(new Request("https://example.test",{method:"POST",body:'{"events":[]}'})),{events:[]});
 console.log("PASS strict website schema, anti-spoofing, privacy, time and streaming body bounds");
}
void main();
