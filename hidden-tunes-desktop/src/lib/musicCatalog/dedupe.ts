type InFlightEntry<T> = {
  promise: Promise<T>
  controller: AbortController
  refs: number
}

const inFlight = new Map<string, InFlightEntry<unknown>>()

/**
 * Deduplicate concurrent identical catalogue requests by key.
 * Shared work aborts only when every waiting caller has aborted.
 */
export async function dedupeAsync<T>(
  key: string,
  factory: (signal: AbortSignal) => Promise<T>,
  externalSignal?: AbortSignal,
): Promise<T> {
  if (externalSignal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }

  let entry = inFlight.get(key) as InFlightEntry<T> | undefined
  if (!entry) {
    const controller = new AbortController()
    const promise = factory(controller.signal)
      .catch((error) => {
        throw error
      })
      .finally(() => {
        const current = inFlight.get(key)
        if (current?.promise === promise) inFlight.delete(key)
      })
    entry = { promise, controller, refs: 0 }
    inFlight.set(key, entry as InFlightEntry<unknown>)
  }

  entry.refs += 1

  const onAbort = () => {
    entry!.refs -= 1
    if (entry!.refs <= 0) {
      entry!.controller.abort()
    }
  }

  if (externalSignal) {
    externalSignal.addEventListener('abort', onAbort)
  }

  try {
    const result = await entry.promise
    if (externalSignal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    return result
  } finally {
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onAbort)
    }
    // Successful waiters release their ref without aborting others.
    entry.refs = Math.max(0, entry.refs - 1)
  }
}

export function clearDedupeAsyncKeys() {
  for (const entry of inFlight.values()) {
    entry.controller.abort()
  }
  inFlight.clear()
}

export function getDedupeInFlightSize() {
  return inFlight.size
}
