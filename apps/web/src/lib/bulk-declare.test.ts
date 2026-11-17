import { describe, expect, it } from "vitest";

import { chunk, isTickable, skipWords } from "./bulk-declare";

describe("isTickable", () => {
  it("offers an undeclared vehicle whose status is shown", () => {
    expect(isTickable({ status: "ON_RECORD", declaredAt: null })).toBe(true);
    expect(isTickable({ status: "SUSPENDED", declaredAt: null })).toBe(true);
  });

  it("does not offer one that is declared", () => {
    expect(isTickable({ status: "ACTIVE", declaredAt: "2026-11-16T10:00:00Z" })).toBe(
      false,
    );
  });

  it("does not offer a retired or archived vehicle", () => {
    expect(isTickable({ status: "RETIRED", declaredAt: null })).toBe(false);
    expect(isTickable({ status: "ARCHIVED", declaredAt: null })).toBe(false);
  });

  it("never offers a row whose status the officer may not see", () => {
    expect(isTickable({ status: undefined, declaredAt: undefined })).toBe(false);
  });
});

describe("chunk", () => {
  it("splits a selection in order, the last chunk shorter", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("makes no request for nothing", () => {
    expect(chunk([], 50)).toEqual([]);
  });

  it("keeps a selection within the limit in one request", () => {
    expect(chunk(Array.from({ length: 50 }, (_, i) => i), 50)).toHaveLength(1);
  });
});

describe("skipWords", () => {
  it("says something for every reason", () => {
    for (const reason of [
      "ALREADY_DECLARED",
      "LEFT_REGISTER",
      "PLATE_ACTIVE_ELSEWHERE",
      "NOT_FOUND",
      "FAILED",
    ] as const) {
      expect(skipWords(reason).length).toBeGreaterThan(0);
    }
  });
});
