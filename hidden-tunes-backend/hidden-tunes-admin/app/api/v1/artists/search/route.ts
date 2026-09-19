import { NextRequest, NextResponse } from "next/server";
import { searchArtistsV1 } from "@/lib/artistIdentityV1Catalog";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") || "";
  const requested = Number(request.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(requested) ? Math.max(1, Math.min(40, Math.floor(requested))) : 20;
  const requestedPage = Number(request.nextUrl.searchParams.get("page"));
  const page = Number.isFinite(requestedPage) ? Math.max(1, Math.floor(requestedPage)) : 1;
  const items = await searchArtistsV1(q, limit + 1, (page - 1) * limit);
  const hasMore = items.length > limit;
  return NextResponse.json({ apiVersion: "v1", items: items.slice(0, limit), pagination: { page, limit, hasMore, nextPage: hasMore ? page + 1 : null } });
}
