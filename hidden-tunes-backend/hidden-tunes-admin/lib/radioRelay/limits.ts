type CounterKey = string;

const stationCounts = new Map<CounterKey, number>();
const clientCounts = new Map<CounterKey, number>();

function bump(map: Map<CounterKey, number>, key: string, delta: number) {
  const next = (map.get(key) || 0) + delta;
  if (next <= 0) map.delete(key);
  else map.set(key, next);
  return next;
}

export function tryAcquireRadioRelaySlot(options: {
  stationId: string;
  clientKey: string;
  maxPerStation: number;
  maxPerClient: number;
}) {
  const stationId = String(options.stationId || "").trim();
  const clientKey = String(options.clientKey || "unknown").trim() || "unknown";
  const stationCount = stationCounts.get(stationId) || 0;
  const clientCount = clientCounts.get(clientKey) || 0;

  if (stationCount >= options.maxPerStation || clientCount >= options.maxPerClient) {
    return null;
  }

  bump(stationCounts, stationId, 1);
  bump(clientCounts, clientKey, 1);

  let released = false;
  return {
    release() {
      if (released) return;
      released = true;
      bump(stationCounts, stationId, -1);
      bump(clientCounts, clientKey, -1);
    },
  };
}

/** Test helper */
export function resetRadioRelayLimitsForTests() {
  stationCounts.clear();
  clientCounts.clear();
}
