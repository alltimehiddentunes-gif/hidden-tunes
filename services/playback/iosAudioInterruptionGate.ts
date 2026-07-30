/**
 * Single JS-side gate for iOS AVAudioSession phone-call interruptions.
 * Does not own playback — PlayerContext remains the resume authority.
 * Pure module (no React) so Node contract tests and RemoteMediaControlsBridge can share it.
 */

export type IosInterruptionOwner = string | null;

export type IosInterruptionBeginInput = {
  sequenceId: number;
  wasPlaying: boolean;
  owner: IosInterruptionOwner;
  loadRequestId: number;
  tapId: number;
};

export type IosInterruptionEndInput = {
  sequenceId: number;
  shouldResume: boolean;
  wasPlaying?: boolean;
  currentOwner: IosInterruptionOwner;
  currentLoadRequestId: number;
  currentTapId: number;
};

export type IosInterruptionResumeDecision = {
  shouldResume: boolean;
  reason: string;
  sequenceId: number;
};

type GateState = {
  active: boolean;
  sequenceId: number;
  wasPlaying: boolean;
  owner: IosInterruptionOwner;
  loadRequestId: number;
  tapId: number;
  userPausedDuring: boolean;
  mediaReplacedDuring: boolean;
  resumeAttempted: boolean;
  resumeCompleted: boolean;
  shouldResumeFromNative: boolean | null;
  beganAt: number;
  appStateDuring: string[];
};

const listeners = new Set<(active: boolean, sequenceId: number) => void>();

let state: GateState = emptyState();

function emptyState(): GateState {
  return {
    active: false,
    sequenceId: 0,
    wasPlaying: false,
    owner: null,
    loadRequestId: 0,
    tapId: 0,
    userPausedDuring: false,
    mediaReplacedDuring: false,
    resumeAttempted: false,
    resumeCompleted: false,
    shouldResumeFromNative: null,
    beganAt: 0,
    appStateDuring: [],
  };
}

function notify() {
  for (const listener of listeners) {
    try {
      listener(state.active, state.sequenceId);
    } catch {
      // Listeners must never throw into the gate.
    }
  }
}

export function subscribeIosAudioInterruption(
  listener: (active: boolean, sequenceId: number) => void
) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isIosAudioInterruptionActive() {
  return state.active;
}

export function getIosAudioInterruptionSequenceId() {
  return state.sequenceId;
}

export function getIosAudioInterruptionSnapshot(): Readonly<GateState> {
  return { ...state, appStateDuring: [...state.appStateDuring] };
}

/**
 * Begin a call/system interruption. Duplicate began for the same active
 * sequence is ignored. A new sequenceId always wins as a fresh cycle.
 */
export function beginIosAudioInterruption(
  input: IosInterruptionBeginInput
): { accepted: boolean; reason: string; sequenceId: number } {
  if (state.active && state.sequenceId === input.sequenceId) {
    return {
      accepted: false,
      reason: "duplicate_began",
      sequenceId: state.sequenceId,
    };
  }

  state = {
    active: true,
    sequenceId: input.sequenceId,
    wasPlaying: Boolean(input.wasPlaying),
    owner: input.owner,
    loadRequestId: input.loadRequestId,
    tapId: input.tapId,
    userPausedDuring: false,
    mediaReplacedDuring: false,
    resumeAttempted: false,
    resumeCompleted: false,
    shouldResumeFromNative: null,
    beganAt: Date.now(),
    appStateDuring: [],
  };
  notify();
  return { accepted: true, reason: "began", sequenceId: state.sequenceId };
}

export function noteIosInterruptionAppState(nextState: string) {
  if (!state.active) return;
  const label = String(nextState || "");
  if (!label) return;
  if (state.appStateDuring[state.appStateDuring.length - 1] === label) return;
  if (state.appStateDuring.length < 12) {
    state.appStateDuring.push(label);
  }
}

export function markIosInterruptionUserPaused() {
  if (!state.active) return;
  state.userPausedDuring = true;
}

export function markIosInterruptionMediaReplaced() {
  if (!state.active) return;
  state.mediaReplacedDuring = true;
}

/**
 * Evaluate resume eligibility for interruption-ended.
 * Marks resumeAttempted when a resume is authorized so duplicates cannot resume twice.
 */
export function endIosAudioInterruption(
  input: IosInterruptionEndInput
): IosInterruptionResumeDecision {
  if (!state.active) {
    return {
      shouldResume: false,
      reason: "no_active_interruption",
      sequenceId: input.sequenceId,
    };
  }

  if (input.sequenceId !== state.sequenceId) {
    return {
      shouldResume: false,
      reason: "sequence_mismatch",
      sequenceId: state.sequenceId,
    };
  }

  if (state.resumeAttempted || state.resumeCompleted) {
    return {
      shouldResume: false,
      reason: "resume_already_handled",
      sequenceId: state.sequenceId,
    };
  }

  state.shouldResumeFromNative = Boolean(input.shouldResume);

  let reason = "ok";
  let shouldResume = true;

  if (!input.shouldResume) {
    shouldResume = false;
    reason = "native_should_resume_false";
  } else if (!state.wasPlaying) {
    shouldResume = false;
    reason = "was_not_playing";
  } else if (state.userPausedDuring) {
    shouldResume = false;
    reason = "user_paused_during";
  } else if (state.mediaReplacedDuring) {
    shouldResume = false;
    reason = "media_replaced_during";
  } else if (input.currentLoadRequestId !== state.loadRequestId) {
    shouldResume = false;
    reason = "load_request_changed";
  } else if (input.currentTapId !== state.tapId) {
    shouldResume = false;
    reason = "tap_id_changed";
  } else if (input.currentOwner !== state.owner) {
    shouldResume = false;
    reason = "owner_changed";
  } else if (state.owner !== "shared-audio") {
    // HiddenAudio resume only applies to shared-audio; TV/video own their surfaces.
    shouldResume = false;
    reason = "owner_not_shared_audio";
  }

  state.resumeAttempted = true;
  if (shouldResume) {
    state.resumeCompleted = true;
  }

  const decision = {
    shouldResume,
    reason,
    sequenceId: state.sequenceId,
  };

  // Clear active gate after decision so AppState recovery can run normally again.
  state.active = false;
  notify();
  return decision;
}

/** Force-clear after resume failure or when abandoning the cycle. */
export function clearIosAudioInterruption(reason = "cleared") {
  const seq = state.sequenceId;
  state.active = false;
  notify();
  return { sequenceId: seq, reason };
}

export function __resetIosAudioInterruptionForTests() {
  state = emptyState();
  listeners.clear();
}

/** Pure resume-policy helper for unit tests (no side effects). */
export function evaluateIosInterruptionResumePolicy(input: {
  active: boolean;
  sequenceId: number;
  eventSequenceId: number;
  shouldResume: boolean;
  wasPlaying: boolean;
  userPausedDuring: boolean;
  mediaReplacedDuring: boolean;
  resumeAttempted: boolean;
  owner: IosInterruptionOwner;
  currentOwner: IosInterruptionOwner;
  loadRequestId: number;
  currentLoadRequestId: number;
  tapId: number;
  currentTapId: number;
}): IosInterruptionResumeDecision {
  if (!input.active) {
    return {
      shouldResume: false,
      reason: "no_active_interruption",
      sequenceId: input.eventSequenceId,
    };
  }
  if (input.eventSequenceId !== input.sequenceId) {
    return {
      shouldResume: false,
      reason: "sequence_mismatch",
      sequenceId: input.sequenceId,
    };
  }
  if (input.resumeAttempted) {
    return {
      shouldResume: false,
      reason: "resume_already_handled",
      sequenceId: input.sequenceId,
    };
  }
  if (!input.shouldResume) {
    return {
      shouldResume: false,
      reason: "native_should_resume_false",
      sequenceId: input.sequenceId,
    };
  }
  if (!input.wasPlaying) {
    return {
      shouldResume: false,
      reason: "was_not_playing",
      sequenceId: input.sequenceId,
    };
  }
  if (input.userPausedDuring) {
    return {
      shouldResume: false,
      reason: "user_paused_during",
      sequenceId: input.sequenceId,
    };
  }
  if (input.mediaReplacedDuring) {
    return {
      shouldResume: false,
      reason: "media_replaced_during",
      sequenceId: input.sequenceId,
    };
  }
  if (input.currentLoadRequestId !== input.loadRequestId) {
    return {
      shouldResume: false,
      reason: "load_request_changed",
      sequenceId: input.sequenceId,
    };
  }
  if (input.currentTapId !== input.tapId) {
    return {
      shouldResume: false,
      reason: "tap_id_changed",
      sequenceId: input.sequenceId,
    };
  }
  if (input.currentOwner !== input.owner) {
    return {
      shouldResume: false,
      reason: "owner_changed",
      sequenceId: input.sequenceId,
    };
  }
  if (input.owner !== "shared-audio") {
    return {
      shouldResume: false,
      reason: "owner_not_shared_audio",
      sequenceId: input.sequenceId,
    };
  }
  return {
    shouldResume: true,
    reason: "ok",
    sequenceId: input.sequenceId,
  };
}
