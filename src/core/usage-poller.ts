import type { UsageSnapshot } from "./types.js";

export type PollerUpdate = {
  snapshot: UsageSnapshot | null;
  stale: boolean;
  error?: string;
};

type Logger = { debug(msg: string): void; warn(msg: string): void; error(msg: string): void };

const MAX_BACKOFF_MS = 5 * 60_000;
const MIN_INTERVAL_MS = 10_000;
const MAX_INTERVAL_MS = 300_000;

/**
 * Shared poller: one ccusage fetch per tick feeds all visible tiles. Pauses at
 * zero visible tiles, backs off exponentially on errors while keeping the
 * last-good snapshot flagged stale, and lets any tile force a refresh.
 */
export class UsagePoller {
  private readonly fetch: (now: Date) => Promise<UsageSnapshot>;
  private readonly logger?: Logger;
  private readonly listeners = new Set<(u: PollerUpdate) => void>();
  private readonly intervalRequests = new Map<string, number>();
  private baseIntervalMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inflight = false;
  private backoffMs = 0;
  private lastGood: UsageSnapshot | null = null;
  private lastError: string | undefined;

  constructor(opts: {
    fetch: (now: Date) => Promise<UsageSnapshot>;
    intervalMs?: number;
    logger?: Logger;
  }) {
    this.fetch = opts.fetch;
    this.baseIntervalMs = opts.intervalMs ?? 30_000;
    this.logger = opts.logger;
  }

  get current(): PollerUpdate {
    return { snapshot: this.lastGood, stale: this.backoffMs > 0, error: this.lastError };
  }

  onUpdate(cb: (u: PollerUpdate) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** A visible tile registers its preferred cadence; the poller runs at the minimum. */
  addRef(id: string, intervalSeconds?: number): void {
    const ms = intervalSeconds
      ? Math.min(Math.max(intervalSeconds * 1000, MIN_INTERVAL_MS), MAX_INTERVAL_MS)
      : this.baseIntervalMs;
    const wasEmpty = this.intervalRequests.size === 0;
    this.intervalRequests.set(id, ms);
    if (wasEmpty) {
      this.logger?.debug("usage poller resumed");
      void this.tick();
    }
  }

  removeRef(id: string): void {
    this.intervalRequests.delete(id);
    if (this.intervalRequests.size === 0 && this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
      this.logger?.debug("usage poller paused (no visible tiles)");
    }
  }

  forceRefresh(): void {
    if (this.intervalRequests.size === 0) return;
    this.backoffMs = 0;
    void this.tick();
  }

  stop(): void {
    this.intervalRequests.clear();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.listeners.clear();
  }

  private effectiveIntervalMs(): number {
    let min = Number.POSITIVE_INFINITY;
    for (const ms of this.intervalRequests.values()) min = Math.min(min, ms);
    return Number.isFinite(min) ? min : this.baseIntervalMs;
  }

  private schedule(delayMs: number): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.intervalRequests.size === 0) return;
    this.timer = setTimeout(() => void this.tick(), delayMs);
  }

  private async tick(): Promise<void> {
    if (this.inflight) return;
    this.inflight = true;
    try {
      const snapshot = await this.fetch(new Date());
      this.lastGood = snapshot;
      this.lastError = undefined;
      this.backoffMs = 0;
      this.emit();
      this.schedule(this.effectiveIntervalMs());
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.backoffMs =
        this.backoffMs === 0
          ? this.effectiveIntervalMs()
          : Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
      this.logger?.warn(`ccusage fetch failed (retry in ${this.backoffMs}ms): ${this.lastError}`);
      this.emit();
      this.schedule(this.backoffMs);
    } finally {
      this.inflight = false;
    }
  }

  private emit(): void {
    const update = this.current;
    for (const cb of this.listeners) {
      try {
        cb(update);
      } catch (err) {
        this.logger?.error(`poller listener threw: ${String(err)}`);
      }
    }
  }
}
