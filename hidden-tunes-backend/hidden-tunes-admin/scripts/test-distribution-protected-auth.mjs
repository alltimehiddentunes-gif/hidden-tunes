import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import ts from "typescript";
const base=path.resolve(process.argv[2]||process.cwd());
function load(file,deps,globals={}){
 const output=ts.transpileModule(fs.readFileSync(path.join(base,file),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const exports={};
 vm.runInNewContext(output,{exports,require(name){assert.ok(name in deps,"Unexpected dependency "+name);return deps[name];},console:{log(){}},...globals});
 return exports;
}
function entryCase({hash="",search="",event,expected}){
 let effect,timer,callback,unsubscribed=false;const destinations=[];
 const home=load("app/page.tsx",{
  react:{useEffect(fn){effect=fn;},useState(v){return[v,()=>{}];}},
  "react/jsx-runtime":{jsx(){return null;}},
  "next/navigation":{useRouter(){return{replace(url){destinations.push(url);}};}},
  "@/lib/auth":{supabase:{auth:{onAuthStateChange(fn){callback=fn;return{data:{subscription:{unsubscribe(){unsubscribed=true;}}}};}}}},
 },{window:{location:{hash,search},setTimeout(fn){timer=fn;return 1;},clearTimeout(){}}});
 home.default();const cleanup=effect();if(event)callback(event);else timer();assert.equal(destinations.at(-1),expected);cleanup();assert.equal(unsubscribed,true);callback("PASSWORD_RECOVERY");assert.equal(destinations.length,1);
}
for(const scenario of [
 {expected:"/admin/upload"},
 {hash:"#type=recovery",expected:"/admin/reset-password"},
 {search:"?type=recovery",expected:"/admin/reset-password"},
 {event:"PASSWORD_RECOVERY",expected:"/admin/reset-password"},
 {event:"INITIAL_SESSION",hash:"#type=recovery",expected:"/admin/reset-password"},
])entryCase(scenario);
let session=null,profile=null,signouts=0;
const supabase={auth:{getSession:async()=>({data:{session}}),signOut:async()=>{signouts++;}},
 from:()=>({select:()=>({eq:()=>({single:async()=>({data:profile,error:null})})})})};
const auth=load("lib/auth.ts",{"./supabaseClient":{supabase}});
assert.equal((await auth.getActiveUploaderSession()).profile,null);
session={user:{id:"isolated-test-only"}};profile={id:"isolated-test-only",status:"active"};
assert.equal((await auth.getActiveUploaderSession()).profile,profile);assert.equal((await auth.getActiveUploaderSession()).session,session);
profile={id:"isolated-test-only",status:"disabled"};
assert.equal((await auth.getActiveUploaderSession()).profile,null);assert.equal(signouts,1);
console.log("PASS protected existing entry/recovery hash/query/event, cleanup, session restoration and disabled-session rejection. Dependencies simulated; no production writes.");
