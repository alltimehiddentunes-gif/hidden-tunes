import { NextResponse } from "next/server";

export function jsonPodcastError(error: string, status: number, details?: unknown) {
  return NextResponse.json(
    {
      success: false,
      error,
      details: details || null,
    },
    { status }
  );
}

export function cleanPodcastFilter(value: string | null) {
  const cleaned = String(value || "").trim();
  return cleaned || null;
}

export function parseBooleanQuery(value: string | null) {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}
