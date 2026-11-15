import { describe, expect, it } from "vitest";

import { FOCUS_THROTTLE_MS, SWR_DEFAULTS } from "./swr-defaults";

describe("SWR defaults", () => {
  it("does not refetch on every tab switch", () => {
    // SWR's own default is five seconds. Anything under a minute would let a
    // busy officer send the whole screen's reads on every switch of tab.
    expect(SWR_DEFAULTS.focusThrottleInterval).toBe(FOCUS_THROTTLE_MS);
    expect(FOCUS_THROTTLE_MS).toBeGreaterThanOrEqual(60_000);
  });
});
