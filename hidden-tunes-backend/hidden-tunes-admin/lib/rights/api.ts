import { NextResponse } from "next/server";

export function rightsJsonError(error: string, status: number, details?: unknown) {
  return NextResponse.json(
    { success: false, error, details: details ?? null },
    { status }
  );
}

export async function readJsonObject(request: Request) {
  const value: unknown = await request.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("JSON body must be an object.");
  }
  return value as Record<string, unknown>;
}

export function positiveInt(value: string | null, fallback: number, maximum: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

