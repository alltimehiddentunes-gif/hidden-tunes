import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST, OPTIONS } from "../app/api/analytics/events/route";
import { GET } from "../app/api/admin/distribution/route";
process.env.NEXT_PUBLIC_SUPABASE_URL="https://distribution-test.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="distribution-test-anon";
process.env.SUPABASE_SERVICE_ROLE_KEY="distribution-test-service";
function request(body:unknown,origin="https://hiddentunes.com",type="application/json"){return new NextRequest("https://admin.hiddentunes.com/api/analytics/events",{method:"POST",headers:{Origin:origin,"Content-Type":type},body:JSON.stringify(body)});}
async function main(){
 assert.equal((await OPTIONS(new NextRequest("https://admin.hiddentunes.com/api/analytics/events",{headers:{Origin:"https://hiddentunes.com"}}))).status,204);
 assert.equal((await OPTIONS(new NextRequest("https://admin.hiddentunes.com/api/analytics/events",{headers:{Origin:"https://evil.example"}}))).status,403);
 assert.equal((await POST(request({events:[]},"https://evil.example"))).status,403);
 assert.equal((await POST(request({events:[]},"https://hiddentunes.com","text/plain"))).status,415);
 assert.equal((await POST(request({events:[{name:"artifact_request"}]}))).status,400);
 assert.equal((await POST(request({events:["x".repeat(33000)]}))).status,413);
 const unauthorized=await GET(new NextRequest("https://admin.hiddentunes.com/api/admin/distribution"));
 assert.equal(unauthorized.status,401);assert.equal(unauthorized.headers.get("Cache-Control"),"no-store");
 const originalFetch=globalThis.fetch;
 let role="uploader",status="active";
 globalThis.fetch=async(input)=>{
  const url=String(input);
  if(url.includes("/auth/v1/user")) return Response.json({id:"ae651d91-9fdb-421f-8e9d-16c5e82e5003",aud:"authenticated",email:"test@example.invalid",created_at:"2026-09-01T00:00:00Z"});
  if(url.includes("/rest/v1/uploader_profiles"))return Response.json({id:"ae651d91-9fdb-421f-8e9d-16c5e82e5003",email:"test@example.invalid",role,status});
  throw new Error("Unexpected network in isolated role test");
 };
 try{
  for(role of ["uploader","creator","artist","moderator","upload_manager"]){
   const response=await GET(new NextRequest("https://admin.hiddentunes.com/api/admin/distribution",{headers:{Authorization:"Bearer isolated-test-token"}}));
   assert.equal(response.status,403,role);
  }
  for(role of ["owner","admin"]){
   const response=await GET(new NextRequest("https://admin.hiddentunes.com/api/admin/distribution?period=bad",{headers:{Authorization:"Bearer isolated-test-token"}}));
   assert.equal(response.status,400,role+" reaches parameter validation after server authorization");
  }
  role="owner";status="inactive";
  assert.equal((await GET(new NextRequest("https://admin.hiddentunes.com/api/admin/distribution",{headers:{Authorization:"Bearer isolated-test-token"}}))).status,403);
 }finally{globalThis.fetch=originalFetch;}
 console.log("PASS analytics route origin/body gates and real shared authorization: anonymous401, non-owner403, inactive403, owner/admin allowed");
}
void main();