/**
 * ScoreBat playback resolution — embed/webview only.
 * Never returns API tokens or extracted HLS/DASH.
 */

import { getScoreBatRuntimeConfig } from "./config";
import { validateScoreBatEmbed } from "./embedSafety";
import { shouldHibernateScoreBat } from "./lifecycle";
import type { ScoreBatLifecycleState } from "./types";

export type ScoreBatPlaybackRequest = {
  fixtureId?: string;
  broadcastId: string;
  embedUrlOrHtml?: string | null;
  lifecycle?: ScoreBatLifecycleState | null;
  providerEnabled?: boolean;
  providerKillSwitch?: boolean;
  playbackFlagEnabled?: boolean;
};

export type ScoreBatPlaybackResponse =
  | {
      ok: true;
      fixtureId: string;
      broadcastId: string;
      mode: "embed" | "webview";
      payload: string;
      expiresAt: string | null;
      provider: "scorebat";
    }
  | {
      ok: false;
      code: string;
      message: string;
    };

export function resolveScoreBatPlayback(
  input: ScoreBatPlaybackRequest
): ScoreBatPlaybackResponse {
  const cfg = getScoreBatRuntimeConfig();
  const playbackEnabled =
    input.playbackFlagEnabled ?? cfg.playbackEnabled;

  if (input.providerKillSwitch || cfg.killSwitch) {
    return {
      ok: false,
      code: "PROVIDER_UNAVAILABLE",
      message: "ScoreBat provider is disabled.",
    };
  }
  if (!(input.providerEnabled ?? cfg.enabled) || !playbackEnabled) {
    return {
      ok: false,
      code: "FEATURE_DISABLED",
      message: "ScoreBat playback is disabled.",
    };
  }

  if (input.lifecycle && shouldHibernateScoreBat(input.lifecycle)) {
    return {
      ok: false,
      code: "EVENT_ENDED",
      message: "This ScoreBat broadcast is no longer playable.",
    };
  }

  if (
    input.lifecycle === "expired" ||
    input.lifecycle === "finished"
  ) {
    // Finished without highlights/replay path — reject live play.
    if (!input.embedUrlOrHtml) {
      return {
        ok: false,
        code: "EVENT_ENDED",
        message: "Live playback has ended.",
      };
    }
  }

  const validated = validateScoreBatEmbed(String(input.embedUrlOrHtml || ""));
  if (!validated.ok) {
    return {
      ok: false,
      code: "NO_AUTHORIZED_SOURCE",
      message: `Embed rejected (${validated.reason}).`,
    };
  }

  return {
    ok: true,
    fixtureId: String(input.fixtureId || ""),
    broadcastId: input.broadcastId,
    mode: "webview",
    payload: validated.embedUrl,
    expiresAt: null,
    provider: "scorebat",
  };
}
