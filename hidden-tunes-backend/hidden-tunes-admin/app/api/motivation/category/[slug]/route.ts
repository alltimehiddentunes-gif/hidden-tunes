import { NextRequest, NextResponse } from "next/server";

import {
  cleanMotivationFilter,
  jsonMotivationError,
  listMotivationItems,
  MOTIVATION_DEFAULT_PAGE_SIZE,
  MOTIVATION_MAX_PAGE_SIZE,
  parsePositiveInt,
  resolveMotivationCategoryName,
  serializeMotivationError,
} from "@/lib/motivationCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { slug } = await context.params;
  const categorySlug = cleanMotivationFilter(slug);
  if (!categorySlug) {
    return jsonMotivationError("Invalid motivation category.", 400);
  }

  const params = request.nextUrl.searchParams;
  const page = parsePositiveInt(params.get("page"), 1, 10_000);
  const limit = parsePositiveInt(
    params.get("limit"),
    MOTIVATION_DEFAULT_PAGE_SIZE,
    MOTIVATION_MAX_PAGE_SIZE
  );

  try {
    const result = await listMotivationItems({
      page,
      limit,
      categorySlug,
    });

    return NextResponse.json({
      success: true,
      category: categorySlug,
      title: resolveMotivationCategoryName(categorySlug),
      items: result.items,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("[motivation] category browse failed", serializeMotivationError(error));
    return jsonMotivationError("Failed to load motivation category.", 500, error);
  }
}
