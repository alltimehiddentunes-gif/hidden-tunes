/** Per-host concurrency cap for verification workers. */

export class DomainConcurrencyLimiter {
  private active = new Map<string, number>();
  private waiters = new Map<string, Array<() => void>>();

  constructor(private readonly perHostLimit: number) {}

  private hostKey(url: string) {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return "invalid-host";
    }
  }

  async acquire(url: string) {
    const host = this.hostKey(url);
    while ((this.active.get(host) || 0) >= this.perHostLimit) {
      await new Promise<void>((resolve) => {
        const queue = this.waiters.get(host) || [];
        queue.push(resolve);
        this.waiters.set(host, queue);
      });
    }
    this.active.set(host, (this.active.get(host) || 0) + 1);
  }

  release(url: string) {
    const host = this.hostKey(url);
    const next = Math.max(0, (this.active.get(host) || 0) - 1);
    if (next === 0) this.active.delete(host);
    else this.active.set(host, next);
    const queue = this.waiters.get(host);
    if (queue && queue.length > 0) {
      const wake = queue.shift();
      wake?.();
    }
  }

  async run<T>(url: string, fn: () => Promise<T>) {
    await this.acquire(url);
    try {
      return await fn();
    } finally {
      this.release(url);
    }
  }
}
