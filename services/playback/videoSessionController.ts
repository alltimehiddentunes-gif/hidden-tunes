/**
 * Imperative stop bridge for the YouTube / Archive video screen owner.
 * Lets audio/TV/sports handoff silence video without importing the screen.
 */

type VideoSessionControllerApi = {
  stopSession: () => void;
  isSessionActive: () => boolean;
};

let api: VideoSessionControllerApi | null = null;

export function registerVideoSessionController(
  next: VideoSessionControllerApi | null
) {
  api = next;
}

export function stopVideoSession() {
  api?.stopSession();
}

export function isVideoSessionActive() {
  return api?.isSessionActive() === true;
}
