import { describe, expect, it } from "vitest";

import {
  LATTICE_ROW,
  LATTICE_SPACING,
  NETWORK_HEIGHT,
  NETWORK_WIDTH,
  PARKS,
  ROUTES,
  junction,
  latticeLines,
  routeCorners,
  routeLength,
  routePath,
} from "./route-network";

const inside = ({ x, y }: { x: number; y: number }) =>
  x >= 0 && x <= NETWORK_WIDTH && y >= 0 && y <= NETWORK_HEIGHT;

/** The angle of a road, folded into [0, 180). */
const angle = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.round(((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI + 360) % 180);

describe("the road network", () => {
  it("places junctions on a triangular lattice", () => {
    expect(junction(0, 0)).toEqual({ x: 0, y: 0 });
    expect(junction(1, 0)).toEqual({ x: LATTICE_SPACING, y: 0 });
    expect(junction(0, 1)).toEqual({ x: LATTICE_SPACING / 2, y: LATTICE_ROW });
    // Three neighbours of one junction, all one spacing away.
    for (const [i, j] of [
      [1, 0],
      [0, 1],
      [-1, 1],
    ]) {
      const { x, y } = junction(i, j);
      expect(Math.hypot(x, y)).toBeCloseTo(LATTICE_SPACING);
    }
  });

  it("runs every route along roads at 0°, 60°, or 120° only", () => {
    for (const route of ROUTES) {
      const corners = routeCorners(route);
      for (let index = 1; index < corners.length; index += 1) {
        expect([0, 60, 120]).toContain(
          angle(corners[index - 1], corners[index]),
        );
      }
    }
  });

  it("brings each route in from outside the drawing and takes it out again", () => {
    for (const route of ROUTES) {
      const corners = routeCorners(route);
      expect(inside(corners[0])).toBe(false);
      expect(inside(corners[corners.length - 1])).toBe(false);
      expect(corners.slice(1, -1).some(inside)).toBe(true);
    }
  });

  it("puts every park where two routes meet, inside the drawing", () => {
    for (const [i, j] of PARKS) {
      const park = junction(i, j);
      expect(inside(park)).toBe(true);
      const meeting = ROUTES.filter((route) =>
        onRoute(routeCorners(route), park),
      );
      expect(meeting.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("measures a route by its legs, and writes it as a path", () => {
    const route = {
      from: [0, 0] as const,
      legs: [
        ["E", 2],
        ["SE", 1],
      ] as const,
    };
    expect(routeLength(route)).toBe(3 * LATTICE_SPACING);
    expect(routePath(route)).toBe("M0 0 L240 0 L300 103.9");
  });

  it("covers the whole drawing with the lattice's three families of road", () => {
    const lines = latticeLines(NETWORK_WIDTH, NETWORK_HEIGHT);
    const families = new Set(
      lines.map((line) =>
        angle({ x: line.x1, y: line.y1 }, { x: line.x2, y: line.y2 }),
      ),
    );
    expect([...families].sort((a, b) => a - b)).toEqual([0, 60, 120]);
    // Every point of the top edge, one spacing apart, starts a road each way.
    const starts = lines.filter((line) => line.y1 === 0 && line.y2 > 0);
    expect(starts.length).toBeGreaterThan(
      (2 * NETWORK_WIDTH) / LATTICE_SPACING,
    );
  });
});

/** Whether a point lies on one of a route's legs. */
function onRoute(
  corners: { x: number; y: number }[],
  point: { x: number; y: number },
) {
  for (let index = 1; index < corners.length; index += 1) {
    const a = corners[index - 1];
    const b = corners[index];
    const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
    const within =
      Math.min(a.x, b.x) - 0.5 <= point.x &&
      point.x <= Math.max(a.x, b.x) + 0.5 &&
      Math.min(a.y, b.y) - 0.5 <= point.y &&
      point.y <= Math.max(a.y, b.y) + 0.5;
    if (Math.abs(cross) < 1 && within) {
      return true;
    }
  }
  return false;
}
