import type { EmotionalPersonalityProfile } from "../state/emotionalPersonality";
import type { EmotionalFlowAutoTune } from "./emotionalFlowAutoTune";

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function signatureBias(signature: Readonly<Record<string, number>>) {
  const values = Object.values(signature);
  if (!values.length) {
    return 0;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return clamp01(total / values.length);
}

function arcBias(arcSignature: EmotionalPersonalityProfile["arcSignature"]) {
  const values = [arcSignature.rising, arcSignature.falling, arcSignature.stable];
  const dominant = Math.max(...values);
  const neutral = 1 / 3;

  return clamp01(Math.max(0, dominant - neutral));
}

export function applyPersonalityBias(
  autoTuneResult: EmotionalFlowAutoTune,
  personalityProfile: EmotionalPersonalityProfile
): EmotionalFlowAutoTune {
  const signatureWorldBias = signatureBias(personalityProfile.worldSignature);
  const signatureMoodBias = signatureBias(personalityProfile.moodSignature);
  const arcSignatureBias = arcBias(personalityProfile.arcSignature);

  return Object.freeze({
    flowStrength: clamp01(
      autoTuneResult.flowStrength +
        personalityProfile.cinematicIntensity * 0.08 +
        signatureMoodBias * 0.06 +
        arcSignatureBias * 0.05
    ),
    worldAffinityBoost: clamp01(
      autoTuneResult.worldAffinityBoost + signatureWorldBias * 0.1
    ),
    lateNightBoost: clamp01(
      autoTuneResult.lateNightBoost + personalityProfile.nightSignature * 0.07
    ),
  });
}
