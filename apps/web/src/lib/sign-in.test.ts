import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SIGN_IN_LIMIT_MS, SLOW_TO_OPEN_MS, settled } from "./sign-in";

describe("settled", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const after = (ms: number, fail = false) =>
    new Promise<void>((resolve, reject) => {
      setTimeout(() => (fail ? reject(new Error("failed")) : resolve()), ms);
    });

  it("says the work finished when it did so in time", async () => {
    const waiting = settled(after(1_000), 5_000);
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(waiting).resolves.toBe(true);
  });

  it("counts work that failed as finished: the wait is over either way", async () => {
    const waiting = settled(after(1_000, true), 5_000);
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(waiting).resolves.toBe(true);
  });

  it("stops waiting when the limit runs out, and says so", async () => {
    const waiting = settled(after(60_000), 5_000);
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(waiting).resolves.toBe(false);
  });

  it("leaves no timer running once the work is done", async () => {
    const waiting = settled(after(1_000), 5_000);
    await vi.advanceTimersByTimeAsync(1_000);
    await waiting;
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("the limits", () => {
  it("tells an officer the next screen is slow well before signing in would give up", () => {
    expect(SLOW_TO_OPEN_MS).toBeLessThan(SIGN_IN_LIMIT_MS);
  });
});
