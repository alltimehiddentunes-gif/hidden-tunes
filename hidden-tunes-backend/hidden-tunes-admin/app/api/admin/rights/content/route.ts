import { NextRequest, NextResponse } from "next/server";

import { positiveInt, rightsJsonError } from "@/lib/rights/api";
import { queryRightsCatalog } from "@/lib/rights/catalogQuery";
import { hashRightsValue, normalizeRightsFilter } from "@/lib/rights/filterSchema";
import { requireRightsPermission } from "@/lib/rights/permissions";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function filterFromQuery(request: NextRequest) {
  const encoded = request.nextUrl.searchParams.get("filter");
  if (!encoded) return { version: 1, all: [] };
  if (encoded.length > 12_000) throw new Error("Encoded filter is too large.");
  return JSON.parse(encoded) as unknown;
}

export async function GET(request: NextRequest) {
  const permission = await requireRightsPermission(request, "read");
  if (permission.errorResponse) return permission.errorResponse;
  try {
    const filter = normalizeRightsFilter(filterFromQuery(request));
    const pageSize = positiveInt(request.nextUrl.searchParams.get("pageSize"), 100, 250);
    const cursor = request.nextUrl.searchParams.get("cursor");
    if (cursor && !/^\d+$/.test(cursor)) return rightsJsonError("Invalid keyset cursor.", 400);
    const result = await queryRightsCatalog({ client: getSupabaseAdmin(), filter, limit: pageSize, afterId: cursor ? Number(cursor) : undefined });
    if (result.error) return rightsJsonError("Unable to query rights catalog.", 500, result.error.message);
    const items = (result.data ?? []) as unknown as Array<{ id: number; [key: string]: unknown }>;
    return NextResponse.json({
      success: true,
      items,
      count: result.count ?? 0,
      pageSize,
      nextCursor: items.length === pageSize ? String(items[items.length - 1].id) : null,
      filter,
      filterHash: hashRightsValue(filter),
    });
  } catch (error) {
    return rightsJsonError("Invalid rights catalog query.", 400, error instanceof Error ? error.message : String(error));
  }
}
