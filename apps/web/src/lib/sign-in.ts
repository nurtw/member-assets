/**
 * Waiting, with an end to it (item 41).
 *
 * Signing in is the one act where an officer has nothing else to look at
 * while they wait, and on a phone's connection a request can stall without
 * failing. Each wait here has a limit, and what happens when it runs out is
 * said on the screen. Nothing is retried without the officer asking.
 */

/** How long signing in may take before it is given up, with a message. */
export const SIGN_IN_LIMIT_MS = 30_000;

/** After signing in, how long the next screen may take before the page says so. */
export const SLOW_TO_OPEN_MS = 12_000;

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
