import {
  MAX_PARALLEL_DISCOVERY_REQUESTS,
} from "../constants/discoveryPerformanceBudget";
import {
  trackDiscoveryRequestCancelled,
  trackDiscoveryRequestEnd,
  trackDiscoveryRequestStart,
} from "./discoveryPerformanceDiagnostics";

type ReleaseSlot = () => void;

let activeDiscoveryRequests = 0;
const slotWaiters: Array<() => void> = [];

function drainDiscoverySlots() {
  while (activeDiscoveryRequests < MAX_PARALLEL_DISCOVERY_REQUESTS && slotWaiters.length > 0) {
    const resume = slotWaiters.shift();
    resume?.();
  }
}

function acquireDiscoverySlot(): Promise<ReleaseSlot> {
  if (activeDiscoveryRequests < MAX_PARALLEL_DISCOVERY_REQUESTS) {
    activeDiscoveryRequests += 1;
    return Promise.resolve(() => {
      activeDiscoveryRequests = Math.max(0, activeDiscoveryRequests - 1);
      drainDiscoverySlots();
    });
  }

  return new Promise((resolve) => {
    slotWaiters.push(() => {
      activeDiscoveryRequests += 1;
      resolve(() => {
        activeDiscoveryRequests = Math.max(0, activeDiscoveryRequests - 1);
        drainDiscoverySlots();
      });
    });
  });
}

export type DiscoveryScreenController = {
  screen: string;
  getGeneration: () => number;
  bumpGeneration: () => number;
  abortAll: () => void;
  run: <T>(label: string, task: (signal: AbortSignal) => Promise<T>) => Promise<T | null>;
};

export function createDiscoveryScreenController(screen: string): DiscoveryScreenController {
  let generation = 0;
  const abortControllers = new Map<string, AbortController>();

  const abortAll = () => {
    abortControllers.forEach((controller) => controller.abort());
    abortControllers.clear();
  };

  const bumpGeneration = () => {
    generation += 1;
    abortAll();
    return generation;
  };

  return {
    screen,
    getGeneration: () => generation,
    bumpGeneration,
    abortAll,
    run: async (label, task) => {
      const requestGeneration = generation;
      const release = await acquireDiscoverySlot();

      abortControllers.get(label)?.abort();
      const abortController = new AbortController();
      abortControllers.set(label, abortController);

      const started = Date.now();
      trackDiscoveryRequestStart(screen, label);

      try {
        const result = await task(abortController.signal);
        if (requestGeneration !== generation || abortController.signal.aborted) {
          trackDiscoveryRequestCancelled(screen, label);
          return null;
        }
        return result;
      } catch (error) {
        if (abortController.signal.aborted || requestGeneration !== generation) {
          trackDiscoveryRequestCancelled(screen, label);
          return null;
        }
        throw error;
      } finally {
        release();
        abortControllers.delete(label);
        trackDiscoveryRequestEnd(screen, label, Date.now() - started);
      }
    },
  };
}

export function getActiveDiscoveryRequestCount() {
  return activeDiscoveryRequests;
}
