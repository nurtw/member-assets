import { describe, expect, it } from "vitest";

import { asCode, isCode, moved, orderAtEnd } from "./reference-list";

/** A list as the seed leaves the designations: numbered from nothing, by ones. */
const list = [
  { id: "chairman", sortOrder: 0 },
  { id: "secretary", sortOrder: 1 },
  { id: "treasurer", sortOrder: 2 },
  { id: "driver", sortOrder: 3 },
  { id: "conductor", sortOrder: 4 },
];

/** The list after the changes are saved, in the order it would then be shown. */
function after(
  entries: { id: string; sortOrder: number }[],
  changes: { id: string; sortOrder: number }[],
): string[] {
  return entries
    .map((entry) => changes.find((change) => change.id === entry.id) ?? entry)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((entry) => entry.id);
}

describe("moved", () => {
  it("puts an entry at the top", () => {
    expect(after(list, moved(list, "driver", "TOP"))).toEqual([
      "driver",
      "chairman",
      "secretary",
      "treasurer",
      "conductor",
    ]);
  });

  it("puts the Union's two first, one move each", () => {
    const first = moved(list, "conductor", "TOP");
    const once = list
      .map((entry) => first.find((change) => change.id === entry.id) ?? entry)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    expect(after(once, moved(once, "driver", "TOP"))).toEqual([
      "driver",
      "conductor",
      "chairman",
      "secretary",
      "treasurer",
    ]);
  });

  it("moves an entry up one place, and down one place", () => {
    expect(after(list, moved(list, "treasurer", "UP"))).toEqual([
      "chairman",
      "treasurer",
      "secretary",
      "driver",
      "conductor",
    ]);
    expect(after(list, moved(list, "treasurer", "DOWN"))).toEqual([
      "chairman",
      "secretary",
      "driver",
      "treasurer",
      "conductor",
    ]);
  });

  it("sends nothing when the entry is already where it was asked to go", () => {
    expect(moved(list, "chairman", "TOP")).toEqual([]);
    expect(moved(list, "chairman", "UP")).toEqual([]);
    expect(moved(list, "conductor", "DOWN")).toEqual([]);
    expect(moved(list, "nobody", "TOP")).toEqual([]);
  });

  it("sends only the numbers that change, once the list is spaced out", () => {
    const spaced = list.map((entry, index) => ({
      ...entry,
      sortOrder: (index + 1) * 10,
    }));
    const changes = moved(spaced, "conductor", "UP");
    expect(changes.map((change) => change.id).sort()).toEqual([
      "conductor",
      "driver",
    ]);
  });

  it("does not change the list it was given", () => {
    moved(list, "driver", "TOP");
    expect(list.map((entry) => entry.id)[0]).toBe("chairman");
  });
});

describe("orderAtEnd", () => {
  it("puts a new entry after the last", () => {
    expect(orderAtEnd(list)).toBe(14);
    expect(orderAtEnd([])).toBe(10);
  });
});

describe("codes", () => {
  it("accepts upper-case letters, digits, and underscores, beginning with a letter", () => {
    expect(isCode("DRIVER")).toBe(true);
    expect(isCode("BUS_INTERSTATE_2")).toBe(true);
  });

  it("refuses what the API would refuse", () => {
    for (const code of ["", "D", "driver", "2ND_DRIVER", "DRIVER-1", "A B"]) {
      expect(isCode(code)).toBe(false);
    }
    expect(isCode("A".repeat(65))).toBe(false);
  });

  it("makes what is typed into a code's shape", () => {
    expect(asCode("financial secretary")).toBe("FINANCIAL_SECRETARY");
    expect(asCode("town-service")).toBe("TOWN_SERVICE");
  });
});
