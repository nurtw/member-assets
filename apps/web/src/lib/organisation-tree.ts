import type { OrganisationTreeNode } from "@nurtw/contracts";
import { childLevelOf, parentLevelOf } from "@nurtw/domain";

/**
 * The Union's structure as the screen shows it (item 38): pure functions over
 * the forest `GET /organisations` returns, so they can be tested without a
 * browser.
 *
 * The forest is already limited by the API to what the officer may read. A
 * branch administrator's forest has their branch at its head, with a parent
 * that is not in it. Nothing here widens that: a destination or a parent is
 * only ever one of the nodes that were sent.
 */

export type Level = OrganisationTreeNode["level"];

export const LEVEL_LABELS: Record<Level, { one: string; many: string }> = {
  COUNCIL: { one: "council", many: "councils" },
  ZONE: { one: "zone", many: "zones" },
  BRANCH: { one: "branch", many: "branches" },
  UNIT: { one: "unit", many: "units" },
};

/** "Zone", for a chip or a heading. */
export function levelName(level: Level): string {
  const { one } = LEVEL_LABELS[level];
  return one.charAt(0).toUpperCase() + one.slice(1);
}

/** What sits directly beneath a node of this level, or `null` for a unit. */
export function levelBeneath(level: Level): Level | null {
  return childLevelOf(level);
}

/** Every node of the forest, parents before their children. */
export function allNodes(
  forest: readonly OrganisationTreeNode[],
): OrganisationTreeNode[] {
  return forest.flatMap((node) => [node, ...allNodes(node.children)]);
}

/**
 * "3 branches", "1 unit", or nothing for a node with none beneath it.
 *
 * Counted from `childCount`, which the API set, and not from the children in
 * hand: a search leaves some of them out, and the council still has every
 * zone it had.
 */
export function childSummary(node: OrganisationTreeNode): string | null {
  const beneath = levelBeneath(node.level);
  if (!beneath || node.childCount === 0) {
    return null;
  }
  const { one, many } = LEVEL_LABELS[beneath];
  return `${node.childCount} ${node.childCount === 1 ? one : many}`;
}

/**
 * The forest narrowed to a name. A node is kept if its name matches, or if
 * something beneath it does, so a match is always shown under its parents.
 * What sits beneath a match is left out unless it matches too.
 */
export function filterForest(
  forest: readonly OrganisationTreeNode[],
  query: string,
): OrganisationTreeNode[] {
  const wanted = query.trim().toLowerCase();
  if (wanted === "") {
    return [...forest];
  }
  return forest.flatMap((node) => {
    const children = filterForest(node.children, wanted);
    return node.name.toLowerCase().includes(wanted) || children.length > 0
      ? [{ ...node, children }]
      : [];
  });
}

/** The ids of every node with something beneath it: all of them, opened. */
export function parentIds(forest: readonly OrganisationTreeNode[]): string[] {
  return allNodes(forest)
    .filter((node) => node.children.length > 0)
    .map((node) => node.id);
}

/**
 * What is open when the screen first loads: the heads of the forest, so a
 * Union-wide officer sees the council and its zones, and nobody is met by
 * ninety rows.
 */
export function initiallyOpen(
  forest: readonly OrganisationTreeNode[],
): string[] {
  return forest.map((node) => node.id);
}

export interface Destination {
  id: string;
  name: string;
  /** The destination's own parent, to tell two branches of one name apart. */
  within: string | null;
}

/**
 * Where a node may be moved: an active node of the level it must sit beneath,
 * other than where it already is. A council sits at the root and moves nowhere.
 */
export function moveDestinations(
  forest: readonly OrganisationTreeNode[],
  node: OrganisationTreeNode,
): Destination[] {
  const needed = parentLevelOf(node.level);
  if (needed === null) {
    return [];
  }
  const nodes = allNodes(forest);
  const names = new Map(nodes.map((entry) => [entry.id, entry.name]));
  return nodes
    .filter(
      (entry) =>
        entry.level === needed && entry.isActive && entry.id !== node.parentId,
    )
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      within: entry.parentId ? (names.get(entry.parentId) ?? null) : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** How many active nodes sit directly beneath this one. */
export function activeChildren(node: OrganisationTreeNode): number {
  return node.children.filter((child) => child.isActive).length;
}

/**
 * Whether the node's parent is inactive, so far as the forest shows. A parent
 * the officer may not see is taken to be active; the API decides regardless.
 */
export function parentIsInactive(
  forest: readonly OrganisationTreeNode[],
  node: OrganisationTreeNode,
): boolean {
  if (!node.parentId) {
    return false;
  }
  const parent = allNodes(forest).find((entry) => entry.id === node.parentId);
  return parent ? !parent.isActive : false;
}
