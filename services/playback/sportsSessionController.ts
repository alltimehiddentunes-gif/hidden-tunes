/**
 * Imperative stop bridge for Sports playback (fixture WebView / broadcast session).
 */

type SportsSessionControllerApi = {
  stopSession: () => void;
  isSessionActive: () => boolean;
};

let api: SportsSessionControllerApi | null = null;

export function registerSportsSessionController(
  next: SportsSessionControllerApi | null
) {
  api = next;
}

export function stopSportsSession() {
  api?.stopSession();
}

export function isSportsSessionActive() {
  return api?.isSessionActive() === true;
}
