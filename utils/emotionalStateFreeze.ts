const SKIP_RING_SIZE = 8;

export class SkipTimestampRingBuffer {
  private readonly slots: number[] = new Array(SKIP_RING_SIZE).fill(0);
  private writeIndex = 0;
  private count = 0;

  clear() {
    this.writeIndex = 0;
    this.count = 0;
  }

  push(timestamp: number) {
    this.slots[this.writeIndex] = timestamp;
    this.writeIndex = (this.writeIndex + 1) % SKIP_RING_SIZE;
    if (this.count < SKIP_RING_SIZE) {
      this.count += 1;
    }
  }

  countWithinWindow(now: number, windowMs: number) {
    let validCount = 0;

    for (let offset = 0; offset < this.count; offset += 1) {
      const index =
        (this.writeIndex - 1 - offset + SKIP_RING_SIZE) % SKIP_RING_SIZE;
      const timestamp = this.slots[index];

      if (now - timestamp <= windowMs) {
        validCount += 1;
      }
    }

    return validCount;
  }
}

export function freezeEmotionalRecord<T extends Record<string, number>>(record: T): T {
  return Object.freeze({ ...record });
}

export function freezeEmotionalIdentitySnapshot<T extends object>(value: T): T {
  const source = value as T & Record<string, unknown>;
  const frozen: Record<string, unknown> = {
    ...source,
  };

  if (source.moodAffinity && typeof source.moodAffinity === "object") {
    frozen.moodAffinity = Object.freeze({
      ...(source.moodAffinity as Record<string, number>),
    });
  }

  if (source.worldAffinity && typeof source.worldAffinity === "object") {
    frozen.worldAffinity = Object.freeze({
      ...(source.worldAffinity as Record<string, number>),
    });
  }

  if (
    source.worldAffinityHistory &&
    typeof source.worldAffinityHistory === "object"
  ) {
    frozen.worldAffinityHistory = Object.freeze({
      ...(source.worldAffinityHistory as Record<string, number>),
    });
  }

  if (source.timeOfDayAffinity && typeof source.timeOfDayAffinity === "object") {
    frozen.timeOfDayAffinity = Object.freeze({
      ...(source.timeOfDayAffinity as Record<string, number>),
    });
  }

  if (
    source.emotionalArcPreference &&
    typeof source.emotionalArcPreference === "object"
  ) {
    frozen.emotionalArcPreference = Object.freeze({
      ...(source.emotionalArcPreference as Record<string, number>),
    });
  }

  return Object.freeze(frozen) as T;
}
