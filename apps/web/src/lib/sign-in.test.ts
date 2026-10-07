import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SIGN_IN_LIMIT_MS,
  SLOW_TO_OPEN_MS,
  STARTING_NOTE_MS,
  WAKE_ATTEMPT_MS,
  settled,
  wasNotThere,
} from "./sign-in";

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

  it("waits longer for a sign-in than the API was measured to take to wake", () => {
    // 7 October 2026: no answer in 90 seconds, then one in 37.
    expect(SIGN_IN_LIMIT_MS).toBeGreaterThan(127_000);
  });

  it("says the System is starting long before one attempt to wake it is over", () => {
    expect(STARTING_NOTE_MS).toBeLessThan(WAKE_ATTEMPT_MS);
  });
});

describe("wasNotThere", () => {
  it("is no answer at all, or a gateway answering for a server that is down", () => {
    expect(wasNotThere(0)).toBe(true);
    expect(wasNotThere(502)).toBe(true);
    expect(wasNotThere(504)).toBe(true);
  });

  it("is never what the API says for itself", () => {
    for (const status of [400, 401, 403, 404, 409, 429, 500, 503]) {
      expect(wasNotThere(status)).toBe(false);
    }
  });
});
