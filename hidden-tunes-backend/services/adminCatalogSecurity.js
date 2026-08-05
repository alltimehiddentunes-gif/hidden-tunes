import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const ALLOWED_ROLES = new Set(["owner", "admin", "upload_manager"]);
const attempts = new Map();
const RATE_WINDOW_MS = 60_000;
// One intentional UI batch performs multiple signed-URL and completion calls.
// Keep a bounded emergency ceiling without breaking the supported 8-item flow.
const RATE_MAX = 60;

export function requestId(req) {
  if (!req.adminRequestId) req.adminRequestId = crypto.randomUUID();
  return req.adminRequestId;
}

function safeIpHash(req) {
  return crypto
    .createHash("sha256")
    .update(String(req.ip || req.socket?.remoteAddress || "unknown"))
    .digest("hex")
    .slice(0, 16);
}

export function auditAdminSecurityEvent(req, action, result, details = {}) {
  console.info(JSON.stringify({
    event: "admin_catalog_security",
    timestamp: new Date().toISOString(),
    requestId: requestId(req),
    actorId: req.adminActor?.id || null,
    ipHash: safeIpHash(req),
    method: req.method,
    route: req.originalUrl,
    action,
    result,
    ...details,
  }));
}

function genericError(req, res, status, error) {
  return res.status(status).json({ error, requestId: requestId(req) });
}

export function adminCors(req, res, next) {
  const origin = String(req.headers.origin || "").trim();
  const allowed = new Set(
    String(process.env.ADMIN_ALLOWED_ORIGINS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );

  if (!origin || !allowed.has(origin)) {
    auditAdminSecurityEvent(req, "cors", "denied");
    return genericError(req, res, 403, "Origin not allowed.");
  }

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type,Idempotency-Key");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  return next();
}

export function adminRateLimit(req, res, next) {
  const now = Date.now();
  const key = safeIpHash(req);
  const current = attempts.get(key);
  const state = !current || now - current.startedAt >= RATE_WINDOW_MS
    ? { startedAt: now, count: 0 }
    : current;
  state.count += 1;
  attempts.set(key, state);

  if (state.count > RATE_MAX) {
    auditAdminSecurityEvent(req, "rate_limit", "denied");
    res.setHeader("Retry-After", "60");
    return genericError(req, res, 429, "Too many requests.");
  }
  return next();
}

export function attachAdminRequestId(req, res, next) {
  const id = requestId(req);
  res.setHeader("X-Request-ID", id);
  return next();
}

function getAdminClient() {
  const url = String(process.env.SUPABASE_URL || "").trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function createRequireAdminCatalogRole({ getClient = getAdminClient } = {}) {
  return async function requireAdminCatalogRole(req, res, next) {
  const header = String(req.headers.authorization || "");
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match?.[1]?.trim()) {
    auditAdminSecurityEvent(req, "authenticate", "denied", { reason: "missing_token" });
    return genericError(req, res, 401, "Authentication required.");
  }

  const client = getClient();
  if (!client) {
    auditAdminSecurityEvent(req, "authenticate", "error", { reason: "server_not_configured" });
    return genericError(req, res, 503, "Administrative uploads are unavailable.");
  }

  try {
    const { data: { user }, error } = await client.auth.getUser(match[1].trim());
    if (error || !user) {
      auditAdminSecurityEvent(req, "authenticate", "denied", { reason: "invalid_token" });
      return genericError(req, res, 401, "Authentication required.");
    }

    const { data: profile, error: profileError } = await client
      .from("uploader_profiles")
      .select("id, role, status")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;

    if (!profile || profile.status !== "active" || !ALLOWED_ROLES.has(profile.role)) {
      req.adminActor = { id: user.id };
      auditAdminSecurityEvent(req, "authorize", "denied");
      return genericError(req, res, 403, "Insufficient permission.");
    }

    req.adminActor = { id: user.id, role: profile.role };
    return next();
  } catch (error) {
    auditAdminSecurityEvent(req, "authenticate", "error");
    console.error("Admin authentication failure", { requestId: requestId(req), error });
    return genericError(req, res, 500, "Administrative request failed.");
  }
  };
}

export const requireAdminCatalogRole = createRequireAdminCatalogRole();

export function requireAdminCatalogUploadEnabled(req, res, next) {
  if (String(process.env.ADMIN_CATALOG_UPLOAD_ENABLED || "").toLowerCase() !== "true") {
    auditAdminSecurityEvent(req, "feature_gate", "disabled");
    return genericError(req, res, 503, "Administrative uploads are disabled.");
  }
  return next();
}

export function requireLegacyMultipartUploadEnabled(req, res, next) {
  if (
    String(process.env.ADMIN_LEGACY_MULTIPART_UPLOAD_ENABLED || "").toLowerCase() !==
    "true"
  ) {
    auditAdminSecurityEvent(req, "legacy_multipart_gate", "disabled");
    return genericError(req, res, 503, "Legacy multipart uploads are disabled.");
  }
  return next();
}

export function resetAdminRateLimitsForTests() {
  attempts.clear();
}
