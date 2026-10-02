import { NextRequest, NextResponse } from "next/server";
import { requireOwnerAlertPermission } from "@/lib/requireOwnerAlertPermission";
import { getSummary } from "@/lib/distribution/store";
import { applyCollectionCoverage } from "@/lib/distribution/collectionCoverage";
const collectionGaps = [{ from: "2026-09-10T00:00:00Z", to: "2026-09-13T00:00:00Z", note: "Website/share collection was interrupted by the 10 September release; 10–12 September coverage is conservatively partial. Observed positives are retained." }];
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(req:NextRequest) {
 const permission=await requireOwnerAlertPermission(req);
 if(permission.errorResponse) {permission.errorResponse.headers.set("Cache-Control","no-store");return permission.errorResponse;}
 const period=req.nextUrl.searchParams.get("period")||"7d";
 if(!["today","7d","30d","all"].includes(period)) return NextResponse.json({error:"Invalid period"},{status:400,headers:{"Cache-Control":"no-store"}});
 try {
  return NextResponse.json(applyCollectionCoverage(getSummary(period as "today"|"7d"|"30d"|"all"), collectionGaps),{headers:{"Cache-Control":"no-store"}});
 } catch {
  return NextResponse.json({error:"Distribution analytics is unavailable. Existing application services are unaffected."},{status:503,headers:{"Cache-Control":"no-store"}});
 }
}
