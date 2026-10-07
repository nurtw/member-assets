/**
 * Waiting, with an end to it (item 41).
 *
 * Signing in is the one act where an officer has nothing else to look at
 * while they wait, and on a phone's connection a request can stall without
 * failing. Each wait here has a limit, and what happens when it runs out is
 * said on the screen. Nothing is retried without the officer asking.
 *
 * **The limits are sized for an API that has gone to sleep.** On 7 October
 * 2026 the live API's host put it to sleep after a quiet spell: the first
 * request got no answer in 90 seconds and the next took 37. That, and not the
 * connection, was the long wait the Union reported. So the sign-in page wakes
 * the API as soon as it opens (`components/api-wake.tsx`), says that it is
 * starting, and waits long enough for it. If the hosting stops sleeping, these
 * numbers cost nothing.
 */

/** How long signing in may take before it is given up, with a message. */
export const SIGN_IN_LIMIT_MS = 150_000;

/** After signing in, how long the next screen may take before the page says so. */
export const SLOW_TO_OPEN_MS = 12_000;

/** How long the page waits for a sign of life before it says the System is starting. */
export const STARTING_NOTE_MS = 4_000;

/** How long one attempt at waking the API may take. */
export const WAKE_ATTEMPT_MS = 60_000;

/** How many times the page tries to wake the API before it says it cannot be reached. */
export const WAKE_ATTEMPTS = 5;

/**
 * Whether a failed request means the API was not there to answer: asleep,
 * starting, or unreachable. `0` is no answer at all; the other two are a
 * gateway saying the same of the server behind it. Never a wrong password,
 * which the API answers for itself.
 */
export function wasNotThere(status: number): boolean {
  return status === 0 || status === 502 || status === 504;
}

/**
 * Waits for `work`, for at most `limitMs`. Answers whether it finished in
 * time. A failure of the work counts as finished: the caller is asking how
 * long to wait, not whether it went well.
 */
export async function settled(
  work: Promise<unknown>,
  limitMs: number,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const ranOut = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), limitMs);
  });
  try {
    return await Promise.race([
      work.then(
        () => true as const,
        () => true as const,
      ),
      ranOut,
    ]);
  } finally {
    clearTimeout(timer);
  }
}
