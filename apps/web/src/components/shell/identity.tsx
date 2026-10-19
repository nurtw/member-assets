import { cn } from "@/lib/cn";
import {
  NETWORK_HEIGHT,
  NETWORK_WIDTH,
  PARKS,
  ROUTES,
  junction,
  latticeLines,
  routeLength,
  routePath,
} from "@/lib/route-network";

/**
 * The Union's pattern and motion (`DESIGN.md` §13): the road network, the
 * emblem at the centre of a roundabout, a steering wheel, the road along a
 * page's foot, and the green bands of the membership card.
 *
 * All of it is decoration. It is hidden from assistive technology, takes no
 * pointer, draws nothing from any record, and never sits behind a verdict.
 * Colours come from the pattern inks in `globals.css`, so both themes, and a
 * green panel (`ink-on-solid`), recolour it without a second drawing. A
 * device that asks for less motion sees it standing still.
 *
 * No hooks: the front page renders it on the server.
 */

const GRID = latticeLines(NETWORK_WIDTH, NETWORK_HEIGHT);
const PATHS = ROUTES.map((route) => ({
  d: routePath(route),
  length: routeLength(route),
}));

/** How fast a vehicle travels, in the drawing's units a second. */
const SPEED = 52;

function hexagon(x: number, y: number, radius: number): string {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 3) * index;
    return `${(x + radius * Math.cos(angle)).toFixed(1)},${(y + radius * Math.sin(angle)).toFixed(1)}`;
  }).join(" ");
}

/**
 * Roads on a triangular lattice, routes along them with their lane markings
 * flowing, the parks where routes meet, and a vehicle on each route. It covers
 * whatever holds it.
 *
 * `id` must be unique on the page: each vehicle follows its route by id.
 */
export function RouteNetwork({
  id,
  grid = true,
  vehicles = true,
  className,
}: {
  id: string;
  /** The faint lattice of every road, beneath the routes. */
  grid?: boolean;
  vehicles?: boolean;
  className?: string;
}) {
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox={`0 0 ${NETWORK_WIDTH} ${NETWORK_HEIGHT}`}
      preserveAspectRatio="xMidYMid slice"
      className={cn("pointer-events-none", className)}
    >
      {grid ? (
        <g className="net-grid">
          {GRID.map((line, index) => (
            <line key={index} {...line} />
          ))}
        </g>
      ) : null}
      {PATHS.map((path, index) => (
        <path
          key={`road-${index}`}
          id={`${id}-route-${index}`}
          d={path.d}
          className="net-road"
        />
      ))}
      {PATHS.map((path, index) => (
        <path key={`lane-${index}`} d={path.d} className="net-lane" />
      ))}
      {PARKS.map(([i, j], index) => {
        const { x, y } = junction(i, j);
        return (
          <g key={`park-${index}`}>
            {index < 2 ? (
              <circle
                cx={x}
                cy={y}
                r={9}
                className="net-pulse"
                style={{ animationDelay: `${index * 1.8}s` }}
              />
            ) : null}
            <polygon points={hexagon(x, y, 9)} className="net-park" />
          </g>
        );
      })}
      {vehicles
        ? PATHS.map((path, index) => {
            const seconds = path.length / SPEED;
            return (
              <rect
                key={`vehicle-${index}`}
                x={-10}
                y={-4}
                width={20}
                height={8}
                rx={4}
                className={index % 2 === 0 ? "net-vehicle" : "net-vehicle-alt"}
              >
                {/* Begun earlier, so each is already on its way when the page opens. */}
                <animateMotion
                  dur={`${seconds.toFixed(1)}s`}
                  begin={`-${((index * 0.29 + 0.15) * seconds).toFixed(1)}s`}
                  repeatCount="indefinite"
                  rotate="auto"
                >
                  <mpath href={`#${id}-route-${index}`} />
                </animateMotion>
              </rect>
            );
          })
        : null}
    </svg>
  );
}

/**
 * The Union's emblem on white, at the centre of a roundabout: a tyre's tread
 * turning slowly around it, the lane flowing, and two vehicles going round
 * (anticlockwise, as traffic does on a Nigerian roundabout).
 */
export function EmblemRoundabout({
  size = 220,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn("relative grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <div className="absolute inset-[12%] rounded-full bg-glow blur-2xl" />
      <svg
        viewBox="0 0 200 200"
        className="absolute inset-0 size-full animate-tread"
      >
        <circle
          cx="100"
          cy="100"
          r="97"
          className="halo-ring"
          strokeDasharray="1.5 7"
        />
      </svg>
      <svg
        viewBox="0 0 200 200"
        className="absolute inset-0 size-full animate-tread-reverse"
      >
        <circle
          cx="100"
          cy="100"
          r="87"
          className="halo-tread"
          strokeDasharray="9 6"
        />
      </svg>
      <svg viewBox="0 0 200 200" className="absolute inset-0 size-full">
        <circle cx="100" cy="100" r="74" className="net-road" />
        <circle cx="100" cy="100" r="74" className="net-lane net-lane-ccw" />
      </svg>
      <svg
        viewBox="0 0 200 200"
        className="absolute inset-0 size-full animate-orbit"
      >
        <rect
          x="91"
          y="22"
          width="18"
          height="8"
          rx="4"
          className="net-vehicle"
        />
      </svg>
      <svg
        viewBox="0 0 200 200"
        className="absolute inset-0 size-full animate-orbit-slow"
      >
        <rect
          x="91"
          y="170"
          width="18"
          height="8"
          rx="4"
          className="net-vehicle-alt"
        />
      </svg>
      <div className="relative grid size-[58%] place-items-center rounded-full bg-paper shadow-lift ring-1 ring-line">
        {/* eslint-disable-next-line @next/next/no-img-element -- a small, static public asset; next/image's build-time optimisation buys nothing here. */}
        <img src="/logo.png" alt="" className="size-[74%] object-contain" />
      </div>
    </div>
  );
}

/**
 * A steering wheel, drawn after the emblem's: a rim, a hub, and three spokes.
 * It takes the colour of its text.
 */
export function SteeringWheel({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={className}
    >
      <circle cx="12" cy="12" r="9.5" />
      <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
      <path d="M12 9.6V2.5M14.1 13.2l6.1 3.5M9.9 13.2l-6.1 3.5" />
    </svg>
  );
}

/**
 * The tail-light trail behind the vehicle on the loader's roundabout: three
 * arcs of one ring, each starting at the vehicle and fainter the longer it
 * is. With `pathLength` 100, a dash of n is n per cent of the ring, and an
 * offset of -75 starts it at twelve o'clock, where the vehicle is.
 */
const TRAIL = [
  { length: 34, opacity: 0.18 },
  { length: 20, opacity: 0.38 },
  { length: 9, opacity: 0.75 },
] as const;

/**
 * Waiting for a screen. The emblem on white, swaying gently as a wheel does,
 * at the centre of a roundabout: a tyre's tread turning, and a vehicle going
 * round anticlockwise with its tail-lights trailing behind it. Beneath, the
 * Union's name and motto, and a short road with its markings moving by.
 *
 * It fades in after a moment, so a screen that is quick to load does not
 * flash it. `compact` leaves out the backdrop and the words, for a part of a
 * page rather than the whole of it.
 */
export function UnionLoader({
  label = "Loading…",
  compact = false,
}: {
  label?: string;
  compact?: boolean;
}) {
  const scene = (
    <div
      aria-hidden
      className={cn("relative", compact ? "size-24" : "size-52")}
    >
      <div className="absolute inset-[16%] rounded-full bg-glow blur-xl" />
      <svg
        viewBox="0 0 160 160"
        className="absolute inset-0 size-full animate-tread"
      >
        <circle
          cx="80"
          cy="80"
          r="76"
          className="halo-ring"
          strokeDasharray="1.5 6"
        />
      </svg>
      <svg viewBox="0 0 160 160" className="absolute inset-0 size-full">
        <circle cx="80" cy="80" r="62" className="net-road" />
        <circle cx="80" cy="80" r="62" className="net-lane net-lane-ccw" />
      </svg>
      <svg
        viewBox="0 0 160 160"
        className="absolute inset-0 size-full animate-lap"
      >
        {TRAIL.map((arc) => (
          <circle
            key={arc.length}
            cx="80"
            cy="80"
            r="62"
            pathLength={100}
            strokeDasharray={`${arc.length} 100`}
            strokeDashoffset={-75}
            className="loader-trail"
            style={{ opacity: arc.opacity }}
          />
        ))}
        <rect
          x="71"
          y="14"
          width="18"
          height="8"
          rx="4"
          className="net-vehicle"
        />
      </svg>
      <div className="absolute inset-[24%] grid place-items-center rounded-full bg-paper shadow-lift ring-1 ring-line">
        {/* eslint-disable-next-line @next/next/no-img-element -- a small, static public asset; next/image's build-time optimisation buys nothing here. */}
        <img
          src="/logo.png"
          alt=""
          className="size-[74%] animate-steer-gentle object-contain"
        />
      </div>
    </div>
  );

  if (compact) {
    return (
      <div
        role="status"
        className="flex animate-loader-in flex-col items-center gap-3 py-6"
      >
        {scene}
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="relative isolate flex min-h-dvh w-full flex-1 animate-loader-in flex-col items-center justify-center gap-7 overflow-hidden px-4"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="glow-corner absolute inset-0" />
        <div className="fade-radial absolute inset-0">
          <div className="size-full pattern-diamond" />
        </div>
      </div>
      {scene}
      <div className="grid justify-items-center text-center">
        <p className="text-base font-semibold tracking-tight">NURTW</p>
        <p className="text-xs text-muted-foreground">Anambra State Council</p>
        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.35em] text-brand-text">
          Safety and Unity
        </p>
        <RoadStrip className="mt-6 h-2 w-36 rounded-full" />
        <p className="mt-3 text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

/** A road along the foot of a page, its lane markings moving by. */
export function RoadStrip({ className }: { className?: string }) {
  return <div aria-hidden className={cn("road-strip", className)} />;
}

/**
 * The Union's rule: a green bar and a red one, as the card sets its green
 * bands beside its red banner.
 */
export function UnionRule({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("flex gap-1", className)}>
      <span className="h-1 w-7 rounded-full bg-primary" />
      <span className="h-1 w-2.5 rounded-full bg-nurtw-red" />
    </span>
  );
}

/**
 * The membership card's green bands, down each side of a wide public page,
 * carrying the Union's name and its motto (`CARD-06`).
 */
export function CardBands() {
  const band =
    "pointer-events-none fixed inset-y-0 z-0 hidden w-9 items-center justify-center overflow-hidden bg-nurtw-green-deep lg:flex";
  const words =
    "relative rotate-180 text-[11px] font-semibold uppercase tracking-[0.45em] text-on-solid [writing-mode:vertical-rl]";
  return (
    <>
      <div aria-hidden className={cn(band, "left-0")}>
        <div className="ink-on-solid pattern-chevron absolute inset-0 opacity-60" />
        <span className={words}>NURTW · Anambra State Council</span>
      </div>
      <div aria-hidden className={cn(band, "right-0")}>
        <div className="ink-on-solid pattern-chevron absolute inset-0 opacity-60" />
        <span className={words}>Safety and Unity</span>
      </div>
    </>
  );
}

/**
 * Behind a public page: a light from the corner, the diamond lattice fading
 * out from the middle, and the road network in the top right.
 */
export function PublicBackdrop({ id }: { id: string }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background"
    >
      <div className="glow-corner absolute inset-0" />
      <div className="fade-radial absolute inset-0">
        <div className="pattern-diamond size-full opacity-70" />
      </div>
      <RouteNetwork
        id={id}
        grid={false}
        className="fade-corner absolute inset-0 size-full opacity-60"
      />
    </div>
  );
}

/**
 * The emblem on white with a tread turning around it, small enough to head a
 * form.
 */
export function EmblemBadge({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("relative mx-auto size-20", className)}>
      <svg
        viewBox="0 0 80 80"
        className="absolute inset-0 size-full animate-tread-reverse"
      >
        <circle
          cx="40"
          cy="40"
          r="37"
          className="halo-tread"
          strokeWidth="4"
          strokeDasharray="5 4"
        />
      </svg>
      <div className="absolute inset-[14%] grid place-items-center rounded-full bg-paper shadow-card ring-1 ring-line">
        {/* eslint-disable-next-line @next/next/no-img-element -- a small, static public asset; next/image's build-time optimisation buys nothing here. */}
        <img src="/logo.png" alt="" className="size-[74%] object-contain" />
      </div>
    </div>
  );
}
