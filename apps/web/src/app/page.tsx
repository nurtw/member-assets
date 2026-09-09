import { ORGANISATION_LEVELS } from "@nurtw/contracts";

/**
 * Scaffold placeholder (roadmap item 01).
 *
 * This exists to prove the toolchain end to end: brand tokens from globals.css
 * render, and a value imported from @nurtw/contracts resolves and type-checks
 * across the workspace boundary. It is not the dashboard — that is item 04.
 */
export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-xl">
        <div className="overflow-hidden rounded-lg border border-border-subtle">
          <div className="bg-nurtw-green px-6 py-5">
            <h1 className="text-xl font-bold tracking-tight text-nurtw-white">
              National Union of Road Transport Workers
            </h1>
            <p className="mt-1 text-sm text-nurtw-white/90">
              Membership and Vehicle Verification System
            </p>
          </div>

          <div className="space-y-4 p-6">
            <p className="text-sm text-foreground/70">
              Scaffold complete. Application modules are delivered from roadmap
              item 02 onwards.
            </p>

            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-nurtw-navy">
                Organisational hierarchy
              </h2>
              <ol className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                {ORGANISATION_LEVELS.map((level, index) => (
                  <li key={level} className="flex items-center gap-2">
                    <span className="rounded bg-surface-muted px-2 py-1 font-mono text-xs">
                      {level}
                    </span>
                    {index < ORGANISATION_LEVELS.length - 1 && (
                      <span aria-hidden className="text-foreground/30">
                        →
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
