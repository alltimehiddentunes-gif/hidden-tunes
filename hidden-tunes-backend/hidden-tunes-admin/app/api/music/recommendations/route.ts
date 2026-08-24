import { NextResponse } from "next/server";
import { getViewerFromAuthorizationHeader } from "@/lib/artistCatalog";
import { SupabaseEmotionalProfileRepository, SupabaseMusicCatalogRepository } from "@/lib/musicIntelligence/recommendationRepositories";
import { recommendMusic } from "@/lib/musicIntelligence/recommendationService";
const responseHeaders = { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache", Vary: "Authorization" };
export async function POST(request: Request) {
  const viewer = await getViewerFromAuthorizationHeader(request.headers.get("authorization")); if (!viewer) return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401, headers: responseHeaders });
  const text = await request.text(); if (new TextEncoder().encode(text).byteLength > 16_384) return NextResponse.json({ success: false, error: "request_too_large" }, { status: 413, headers: responseHeaders });
  let body: unknown; try { body = JSON.parse(text); } catch { return NextResponse.json({ success: false, error: "invalid_json" }, { status: 400, headers: responseHeaders }); }
  const diagnostics = process.env.NODE_ENV !== "production" && request.headers.get("x-hidden-tunes-recommendation-diagnostics") === "1";
  const result = await recommendMusic(body, viewer.id, { catalog: new SupabaseMusicCatalogRepository(), profiles: new SupabaseEmotionalProfileRepository(), diagnostics, territory: request.headers.get("x-vercel-ip-country") ?? request.headers.get("cf-ipcountry") });
  const status = !result.success && result.error === "invalid_request" ? 400 : !result.success && result.error === "seed_not_found" ? 404 : !result.success && result.error === "service_unavailable" ? 503 : 200;
  return NextResponse.json(result, { status, headers: responseHeaders });
}
