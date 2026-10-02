import { NextRequest, NextResponse } from "next/server";
import { requireOwnerAlertPermission } from "@/lib/requireOwnerAlertPermission";
import { getAppleAppStoreSummary, importAppleAppStoreReport, AppleAppStoreError } from "@/lib/distribution/appleAppStoreStore";
import type { AppleAppStorePeriod } from "@/lib/distribution/appleAppStoreTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const MAX_BYTES = 2_000_000;
const imports = new Map<string, { until: number; count: number }>();
const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });

export async function GET(req: NextRequest) {
  const permission = await requireOwnerAlertPermission(req);
  if (permission.errorResponse) { permission.errorResponse.headers.set("Cache-Control", "no-store"); return permission.errorResponse; }
  const period = req.nextUrl.searchParams.get("period") || "7d";
  if (!["today", "7d", "30d", "all"].includes(period)) return response({ error: "Invalid period" }, 400);
  try { return response(getAppleAppStoreSummary(period as AppleAppStorePeriod)); }
  catch { return response({ error: "Apple App Store reporting is temporarily unavailable." }, 503); }
}

async function readReport(req: NextRequest): Promise<unknown> {
  const declared = req.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_BYTES)) throw new Error("LIMIT");
  if (!req.body) throw new Error("JSON");
  const reader = req.body.getReader();
  const parts: Uint8Array[] = [];
  let bytes = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("TIMEOUT")), 5_000); });
  try {
    while (true) {
      const part = await Promise.race([reader.read(), deadline]);
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > MAX_BYTES) throw new Error("LIMIT");
      parts.push(part.value);
    }
    try { return JSON.parse(Buffer.concat(parts).toString("utf8")); }
    catch { throw new Error("JSON"); }
  } finally { clearTimeout(timer); void reader.cancel().catch(() => {}); }
}

export async function POST(req: NextRequest) {
  const permission = await requireOwnerAlertPermission(req);
  if (permission.errorResponse) { permission.errorResponse.headers.set("Cache-Control", "no-store"); return permission.errorResponse; }
  const origin = req.headers.get("origin");
  const local = process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(req.nextUrl.hostname) && origin === req.nextUrl.origin;
  if (origin !== "https://admin.hiddentunes.com" && !local) return response({ error: "Unsupported report import origin." }, 403);
  if (req.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") return response({ error: "Use a validated JSON report." }, 415);
  const now = Date.now();
  for (const [id, slot] of imports) if (slot.until <= now) imports.delete(id);
  const key = permission.profile.id;
  const slot = imports.get(key) || { until: now + 60_000, count: 0 };
  if (slot.count >= 6 || !imports.has(key) && imports.size >= 256) return response({ error: "Please wait before importing another report." }, 429);
  slot.count++; imports.set(key, slot);
  let report: unknown;
  try { report = await readReport(req); }
  catch (error) { return response({ error: "Report must be valid JSON under 2 MB." }, error instanceof Error && error.message === "LIMIT" ? 413 : 400); }
  if (!report || typeof report !== "object" || (report as { source?: unknown }).source !== "apple_report") return response({ error: "Uploaded reports must identify the source as apple_report." }, 400);
  try { return response(importAppleAppStoreReport(report)); }
  catch (error) {
    if (error instanceof AppleAppStoreError && ["INVALID_REPORT", "COUNTER_OVERFLOW"].includes(error.code)) return response({ error: error.message }, 400);
    return response({ error: "The report could not be stored. Existing measurements are preserved." }, 503);
  }
}
