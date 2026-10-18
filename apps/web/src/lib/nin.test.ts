import { describe, expect, it } from "vitest";

import { isNin, ninStatement } from "./nin";

describe("what passes for a NIN on the screen", () => {
  it("eleven digits, however they were spaced", () => {
    expect(isNin("12345678901")).toBe(true);
    expect(isNin("123 4567 8901")).toBe(true);
    expect(isNin("123-4567-8901")).toBe(true);
  });

  it("anything else does not", () => {
    for (const typed of ["", "1234567890", "123456789012", "12345678 9O1"]) {
      expect(isNin(typed)).toBe(false);
    }
  });
});

describe("how a recorded NIN is spoken of", () => {
  it("by its last four digits to an officer who may read them", () => {
    expect(ninStatement({ ninRecorded: true, ninLastFour: "8901" })).toBe(
      "Recorded, ending 8901",
    );
  });

  it("only as recorded to anybody else", () => {
    expect(ninStatement({ ninRecorded: true })).toBe("Recorded");
    expect(ninStatement({ ninRecorded: true, ninLastFour: null })).toBe(
      "Recorded",
    );
  });

  it("as not recorded where there is none", () => {
    expect(ninStatement({ ninRecorded: false, ninLastFour: null })).toBe(
      "Not recorded",
    );
  });
});
