import { allowIntake } from "@/lib/distribution/intakeRateLimit";
import { createHmac, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ALLOWED_ORIGINS, readBoundedJson, validateBatch, ValidationError } from "@/lib/distribution/validation";
import { ingestEvents } from "@/lib/distribution/store";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const salt=randomBytes(32);
function headers(origin:string) {return {"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type","Access-Control-Max-Age":"600","Vary":"Origin","Cache-Control":"no-store"};}
export async function OPTIONS(req:NextRequest) {
 const origin=req.headers.get("origin")||"";
 if(!ALLOWED_ORIGINS.has(origin)) return new NextResponse(null,{status:403,headers:{"Cache-Control":"no-store","Vary":"Origin"}});
 return new NextResponse(null,{status:204,headers:headers(origin)});
}
export async function POST(req:NextRequest) {
 const origin=req.headers.get("origin")||"";
 if(!ALLOWED_ORIGINS.has(origin)) return NextResponse.json({error:"Origin not permitted"},{status:403,headers:{"Cache-Control":"no-store","Vary":"Origin"}});
 const h=headers(origin);
 const rateKey=createHmac("sha256",salt).update((req.headers.get("x-real-ip")||"unavailable").slice(0,80)).digest("hex");
 if(!allowIntake(rateKey)) return NextResponse.json({error:"Please retry later"},{status:429,headers:{...h,"Retry-After":"60"}});
 if(req.headers.get("content-type")?.split(";")[0].trim()!=="application/json") return NextResponse.json({error:"JSON required"},{status:415,headers:h});
 try {
  const events=validateBatch(await readBoundedJson(req));
  // Nginx overwrites X-Real-IP. The transient HMAC is only a short-lived rate bucket;
  // it is never an analytics dimension, identity, or raw IP record.
  const result=ingestEvents(events,rateKey);
  return NextResponse.json(result,{status:202,headers:h});
 } catch(error) {
  if(error instanceof ValidationError) return NextResponse.json({error:error.message},{status:error.message==="Payload too large"?413:400,headers:h});
  if(error&&typeof error==="object"&&"code" in error&&error.code==="RATE_LIMITED") return NextResponse.json({error:"Please retry later"},{status:429,headers:{...h,"Retry-After":"60"}});
  // Do not expose database paths, content, credentials, or submitted event bodies.
  return NextResponse.json({error:"Analytics temporarily unavailable"},{status:503,headers:{...h,"Retry-After":"60"}});
 }
}
