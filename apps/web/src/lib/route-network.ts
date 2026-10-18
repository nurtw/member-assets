/**
 * The road network drawn behind the public pages and the shell (`DESIGN.md`
 * §13). It is decoration, and draws nothing from any record.
 *
 * Roads run in three directions only, 0°, 60°, and 120°: a triangular
 * lattice, so every junction meets six roads at equal angles. A route is a
 * walk along those roads from one junction to another, given as a starting
 * junction and its legs; the parks are junctions that routes share.
 */

/** The distance between neighbouring junctions, in the drawing's units. */
export const LATTICE_SPACING = 120;

/** The height of one row of junctions. */
export const LATTICE_ROW = (LATTICE_SPACING * Math.sqrt(3)) / 2;

/** The drawing's own size; it is scaled to cover whatever holds it. */
export const NETWORK_WIDTH = 1440;
export const NETWORK_HEIGHT = 900;

export interface Point {
  x: number;
  y: number;
}

export interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** A step from one junction to its neighbour. */
export type Step = "E" | "W" | "NE" | "NW" | "SE" | "SW";

const STEPS: Record<Step, readonly [number, number]> = {
  E: [1, 0],
  W: [-1, 0],
  SE: [0, 1],
  NW: [0, -1],
  SW: [-1, 1],
  NE: [1, -1],
};

export interface Route {
  /** The junction it starts from, as lattice coordinates. */
  from: readonly [number, number];
  /** Each leg: a direction, and how many junctions it runs. */
  legs: readonly (readonly [Step, number])[];
}

/** Where junction (i, j) sits in the drawing. */
export function junction(i: number, j: number): Point {
  return {
    x: i * LATTICE_SPACING + j * (LATTICE_SPACING / 2),
    y: j * LATTICE_ROW,
  };
}

/** The junctions a route turns at, from its start to its end. */
export function routeCorners(route: Route): Point[] {
  let [i, j] = route.from;
  const corners = [junction(i, j)];
  for (const [step, count] of route.legs) {
    const [di, dj] = STEPS[step];
    i += di * count;
    j += dj * count;
    corners.push(junction(i, j));
  }
  return corners;
}

/** The route as an SVG path. */
export function routePath(route: Route): string {
  return routeCorners(route)
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${round(point.x)} ${round(point.y)}`,
    )
    .join(" ");
}

/** How long the route is, in the drawing's units. */
export function routeLength(route: Route): number {
  return (
    route.legs.reduce((total, [, count]) => total + count, 0) * LATTICE_SPACING
  );
}

/**
 * Every road of the lattice that crosses a box of this size: the rows, then
 * the roads at 60°, then those at 120°. Each runs from the top edge to the
 * bottom, or across the whole width.
 */
export function latticeLines(width: number, height: number): Line[] {
  const lines: Line[] = [];
  const rows = Math.ceil(height / LATTICE_ROW);
  for (let j = 0; j <= rows; j += 1) {
    const y = round(j * LATTICE_ROW);
    lines.push({ x1: 0, y1: y, x2: width, y2: y });
  }
  // A road at 60° or 120° crosses the box's height over this much width.
  const run = height / Math.sqrt(3);
  const before = Math.ceil(run / LATTICE_SPACING);
  const after = Math.ceil(width / LATTICE_SPACING);
  for (let i = -before; i <= after; i += 1) {
    const x = i * LATTICE_SPACING;
    lines.push({ x1: round(x), y1: 0, x2: round(x + run), y2: round(height) });
  }
  for (let i = 0; i <= after + before; i += 1) {
    const x = i * LATTICE_SPACING;
    lines.push({ x1: round(x), y1: 0, x2: round(x - run), y2: round(height) });
  }
  return lines;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * The network itself. Each route enters from one edge and leaves by another,
 * so a vehicle on it comes and goes rather than appearing in the middle.
 */
export const ROUTES: readonly Route[] = [
  {
    from: [-4, 6],
    legs: [
      ["E", 3],
      ["NE", 2],
      ["E", 4],
      ["NE", 1],
      ["E", 5],
    ],
  },
  {
    from: [3, -1],
    legs: [
      ["SE", 3],
      ["E", 2],
      ["SE", 4],
      ["SW", 3],
    ],
  },
  {
    from: [12, 1],
    legs: [
      ["W", 3],
      ["SW", 2],
      ["W", 2],
      ["SW", 3],
      ["W", 3],
      ["SW", 3],
    ],
  },
  {
    from: [7, 9],
    legs: [
      ["NW", 3],
      ["W", 2],
      ["NW", 2],
      ["W", 4],
      ["NW", 5],
    ],
  },
];

/** Junctions where routes meet: the parks. The first two pulse. */
export const PARKS: readonly (readonly [number, number])[] = [
  [5, 4],
  [-1, 6],
  [6, 3],
  [1, 4],
  [5, 6],
];
