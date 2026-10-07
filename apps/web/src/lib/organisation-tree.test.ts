import type { OrganisationTreeNode } from "@nurtw/contracts";
import { describe, expect, it } from "vitest";

import {
  activeChildren,
  allNodes,
  childSummary,
  filterForest,
  initiallyOpen,
  levelBeneath,
  levelName,
  moveDestinations,
  parentIds,
  parentIsInactive,
} from "./organisation-tree";

function node(
  id: string,
  level: OrganisationTreeNode["level"],
  parentId: string | null,
  children: OrganisationTreeNode[] = [],
  isActive = true,
): OrganisationTreeNode {
  return {
    id,
    name: id,
    level,
    parentId,
    stateName: null,
    isActive,
    depth: 0,
    childCount: children.length,
    children,
  };
}

const unitA = node("Motor Park Unit", "UNIT", "Upper Branch");
const unitB = node("Garage Unit", "UNIT", "Upper Branch", [], false);
const upper = node("Upper Branch", "BRANCH", "North Zone", [unitA, unitB]);
const lower = node("Lower Branch", "BRANCH", "North Zone");
const closed = node("Closed Branch", "BRANCH", "South Zone", [], false);
const north = node("North Zone", "ZONE", "Council", [upper, lower]);
const south = node("South Zone", "ZONE", "Council", [closed]);
const council = node("Council", "COUNCIL", null, [north, south]);
const forest = [council];

describe("levels", () => {
  it("names a level, and what sits beneath it", () => {
    expect(levelName("BRANCH")).toBe("Branch");
    expect(levelBeneath("COUNCIL")).toBe("ZONE");
    expect(levelBeneath("BRANCH")).toBe("UNIT");
  });

  it("puts nothing beneath a unit", () => {
    expect(levelBeneath("UNIT")).toBeNull();
  });
});

describe("childSummary", () => {
  it("counts what is beneath, in its own word", () => {
    expect(childSummary(council)).toBe("2 zones");
    expect(childSummary(upper)).toBe("2 units");
    expect(childSummary(south)).toBe("1 branch");
  });

  it("says nothing of a node with none", () => {
    expect(childSummary(lower)).toBeNull();
    expect(childSummary(unitA)).toBeNull();
  });

  it("still counts everything beneath while a search hides some of it", () => {
    const [found] = filterForest(forest, "garage");
    expect(found?.children).toHaveLength(1);
    expect(childSummary(found!)).toBe("2 zones");
  });
});

describe("allNodes", () => {
  it("lists every node, a parent before its children", () => {
    expect(allNodes(forest).map((entry) => entry.id)).toEqual([
      "Council",
      "North Zone",
      "Upper Branch",
      "Motor Park Unit",
      "Garage Unit",
      "Lower Branch",
      "South Zone",
      "Closed Branch",
    ]);
  });
});

describe("filterForest", () => {
  it("returns everything for an empty search", () => {
    expect(allNodes(filterForest(forest, "  "))).toHaveLength(8);
  });

  it("keeps a match beneath its parents, and leaves its siblings out", () => {
    const found = allNodes(filterForest(forest, "garage")).map(
      (entry) => entry.id,
    );
    expect(found).toEqual([
      "Council",
      "North Zone",
      "Upper Branch",
      "Garage Unit",
    ]);
  });

  it("leaves out what is beneath a match unless it matches too", () => {
    const found = allNodes(filterForest(forest, "upper")).map(
      (entry) => entry.id,
    );
    expect(found).toEqual(["Council", "North Zone", "Upper Branch"]);
  });

  it("ignores case, and finds nothing where nothing matches", () => {
    expect(filterForest(forest, "LOWER BRANCH")).toHaveLength(1);
    expect(filterForest(forest, "market")).toEqual([]);
  });

  it("does not change the forest it was given", () => {
    filterForest(forest, "garage");
    expect(upper.children).toHaveLength(2);
  });
});

describe("what is open", () => {
  it("opens the heads of the forest to begin with", () => {
    expect(initiallyOpen(forest)).toEqual(["Council"]);
    expect(initiallyOpen([upper, lower])).toEqual([
      "Upper Branch",
      "Lower Branch",
    ]);
  });

  it("opens every parent while a search is showing", () => {
    expect(parentIds(filterForest(forest, "garage"))).toEqual([
      "Council",
      "North Zone",
      "Upper Branch",
    ]);
  });
});

describe("moveDestinations", () => {
  it("offers a unit the other active branches", () => {
    expect(moveDestinations(forest, unitA)).toEqual([
      { id: "Lower Branch", name: "Lower Branch", within: "North Zone" },
    ]);
  });

  it("never offers an inactive destination, or where the node already is", () => {
    const names = moveDestinations(forest, unitA).map((entry) => entry.name);
    expect(names).not.toContain("Closed Branch");
    expect(names).not.toContain("Upper Branch");
  });

  it("offers a branch the other zone", () => {
    expect(moveDestinations(forest, upper).map((entry) => entry.id)).toEqual([
      "South Zone",
    ]);
  });

  it("moves a council nowhere", () => {
    expect(moveDestinations(forest, council)).toEqual([]);
  });

  it("offers only what the officer was sent", () => {
    // A branch administrator's forest: one branch, its zone not in it.
    expect(moveDestinations([upper], unitA)).toEqual([]);
    expect(moveDestinations([upper], upper)).toEqual([]);
  });
});

describe("what stops a change of status", () => {
  it("counts the active nodes directly beneath", () => {
    expect(activeChildren(upper)).toBe(1);
    expect(activeChildren(south)).toBe(0);
    expect(activeChildren(council)).toBe(2);
  });

  it("knows a parent it can see is inactive", () => {
    const orphan = node("Stranded Unit", "UNIT", "Closed Branch", [], false);
    const withOrphan = [
      node("Council", "COUNCIL", null, [
        node("South Zone", "ZONE", "Council", [
          node("Closed Branch", "BRANCH", "South Zone", [orphan], false),
        ]),
      ]),
    ];
    expect(parentIsInactive(withOrphan, orphan)).toBe(true);
    expect(parentIsInactive(forest, unitB)).toBe(false);
  });

  it("takes a parent it cannot see to be active", () => {
    expect(parentIsInactive([upper], upper)).toBe(false);
    expect(parentIsInactive(forest, council)).toBe(false);
  });
});
