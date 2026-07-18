/**
 * Opaque Sports playback token helpers (no DB).
 */

import { createHash, randomBytes } from "node:crypto";

export function hashPlaybackToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function mintPlaybackToken(): string {
  return randomBytes(24).toString("base64url");
}
