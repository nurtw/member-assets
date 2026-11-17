import { describe, expect, it } from "vitest";

import { lagosDay, lagosDaysBefore, readableDay } from "./lagos-day";

describe("lagosDay", () => {
  it("puts 23:00 UTC in the next Lagos day", () => {
    expect(lagosDay(new Date("2026-11-15T22:59:59Z"))).toBe("2026-11-15");
    expect(lagosDay(new Date("2026-11-15T23:00:00Z"))).toBe("2026-11-16");
  });
});

describe("lagosDaysBefore", () => {
  it("counts back whole days", () => {
    expect(lagosDaysBefore(new Date("2026-11-16T10:00:00Z"), 6)).toBe("2026-11-10");
    expect(lagosDaysBefore(new Date("2026-11-16T10:00:00Z"), 0)).toBe("2026-11-16");
  });
});

describe("readableDay", () => {
  it("writes the day the way officers read it", () => {
    expect(readableDay("2026-11-16")).toBe("16 Nov 2026");
  });
});
