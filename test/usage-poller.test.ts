import { describe, expect, it } from "vitest";
import { UsagePoller, type PollerUpdate } from "../src/core/usage-poller.js";
import type { UsageSnapshot } from "../src/core/types.js";

function snapshot(cost: number): UsageSnapshot {
  const totals = { costUSD: cost, totalTokens: 1, inputTokens: 1, outputTokens: 1 };
  return { block: null, today: totals, week: totals, month: totals, updatedAt: Date.now() };
}

const nextUpdate = (poller: UsagePoller): Promise<PollerUpdate> =>
  new Promise((resolve) => {
    const off = poller.onUpdate((u) => {
      off();
      resolve(u);
    });
  });

describe("UsagePoller", () => {
  it("fetches when the first tile appears and pauses at zero tiles", async () => {
    let calls = 0;
    const poller = new UsagePoller({ fetch: async () => (calls++, snapshot(1)), intervalMs: 20 });

    expect(poller.current.snapshot).toBeNull();
    const first = nextUpdate(poller);
    poller.addRef("tile-1");
    await first;
    expect(calls).toBe(1);
    expect(poller.current.snapshot!.today.costUSD).toBe(1);

    poller.removeRef("tile-1");
    const callsAtPause = calls;
    await new Promise((r) => setTimeout(r, 80));
    expect(calls).toBe(callsAtPause); // paused
    poller.stop();
  });

  it("keeps last-good value flagged stale on errors, then recovers", async () => {
    let fail = false;
    const poller = new UsagePoller({
      fetch: async () => {
        if (fail) throw new Error("ccusage exploded");
        return snapshot(2);
      },
      intervalMs: 15,
    });

    const first = nextUpdate(poller);
    poller.addRef("t");
    await first;
    expect(poller.current.stale).toBe(false);

    fail = true;
    const staleUpdate = await nextUpdate(poller);
    expect(staleUpdate.stale).toBe(true);
    expect(staleUpdate.snapshot!.today.costUSD).toBe(2); // last-good kept
    expect(staleUpdate.error).toContain("ccusage exploded");

    fail = false;
    poller.forceRefresh();
    for (let i = 0; i < 10 && poller.current.stale; i++) await new Promise((r) => setTimeout(r, 20));
    expect(poller.current.stale).toBe(false);
    poller.stop();
  });

  it("backs off exponentially while failing", async () => {
    const times: number[] = [];
    const poller = new UsagePoller({
      fetch: async () => {
        times.push(Date.now());
        throw new Error("down");
      },
      intervalMs: 10,
    });
    poller.addRef("t");
    await new Promise((r) => setTimeout(r, 150));
    poller.stop();
    // 10ms, 20ms, 40ms, 80ms… → at most ~5 attempts in 150ms; without backoff ~15.
    expect(times.length).toBeGreaterThanOrEqual(2);
    expect(times.length).toBeLessThanOrEqual(6);
  });
});
