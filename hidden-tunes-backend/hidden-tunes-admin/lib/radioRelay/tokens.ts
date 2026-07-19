import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import {
  RADIO_RELAY_TOKEN_TTL_SEC,
  getRadioRelayPublicBaseUrl,
  getRadioRelaySigningSecret,
} from "./constants";

export type RadioRelayTokenPayload = {
  sid: string;
  exp: number;
  n: string;
};

function base64UrlEncode(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecodeToString(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64").toString("utf8");
}

function signPayload(encodedPayload: string, secret: string) {
  return base64UrlEncode(createHmac("sha256", secret).update(encodedPayload).digest());
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function createRadioRelayToken(stationId: string, ttlSec = RADIO_RELAY_TOKEN_TTL_SEC) {
  const secret = getRadioRelaySigningSecret();
  if (!secret) {
    throw new Error("radio_relay_secret_missing");
  }

  const payload: RadioRelayTokenPayload = {
    sid: String(stationId || "").trim(),
    exp: Math.floor(Date.now() / 1000) + Math.max(30, Math.min(600, Math.floor(ttlSec))),
    n: randomBytes(8).toString("hex"),
  };

  if (!payload.sid) {
    throw new Error("radio_relay_station_required");
  }

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function verifyRadioRelayToken(token: string, expectedStationId: string) {
  const secret = getRadioRelaySigningSecret();
  if (!secret) return { ok: false as const, reason: "secret_missing" };

  const raw = String(token || "").trim();
  const parts = raw.split(".");
  if (parts.length !== 2) return { ok: false as const, reason: "malformed_token" };

  const [encodedPayload, signature] = parts;
  const expectedSig = signPayload(encodedPayload, secret);
  if (!safeEqual(signature, expectedSig)) {
    return { ok: false as const, reason: "bad_signature" };
  }

  let payload: RadioRelayTokenPayload;
  try {
    payload = JSON.parse(base64UrlDecodeToString(encodedPayload)) as RadioRelayTokenPayload;
  } catch {
    return { ok: false as const, reason: "bad_payload" };
  }

  const sid = String(payload?.sid || "").trim();
  const exp = Number(payload?.exp);
  if (!sid || sid !== String(expectedStationId || "").trim()) {
    return { ok: false as const, reason: "station_mismatch" };
  }
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
    return { ok: false as const, reason: "expired" };
  }

  return { ok: true as const, payload };
}

export function buildRadioRelayStreamUrl(stationId: string) {
  const token = createRadioRelayToken(stationId);
  const base = getRadioRelayPublicBaseUrl();
  return `${base}/api/radio/stations/${encodeURIComponent(stationId)}/relay?token=${encodeURIComponent(token)}`;
}
