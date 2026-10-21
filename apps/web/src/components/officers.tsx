"use client";

import type { OrganisationTreeNode } from "@nurtw/contracts";
import { needsSecondFactor } from "@nurtw/domain";
import { useState } from "react";
import useSWR from "swr";

import { Button, Field, Select, TextInput } from "@/components/ui";
import { fetcher } from "@/lib/api";
import { matchesPermission } from "@/lib/officer-access";

/**
 * Pieces shared by the officer screens (item 28): the one-time password
 * panel, the organisation picker, and the permission checklist (item 56). The sidebar names each screen (item
 * 32), so they carry no tabs of their own.
 */

/**
 * A temporary password, shown the one time it exists outside its hash.
 *
 * It lives in this component's state and nowhere else: not in the URL, the
 * SWR cache, or browser storage. Leaving the page loses it, and the remedy is
 * to issue another.
 */
export function TemporaryPassword({
  password,
  officerName,
  onDone,
}: {
  password: string;
  officerName: string;
  onDone: () => void;
}) {
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");

  return (
    <section
      aria-labelledby="temporary-password-title"
      className="rounded-lg border-2 border-verdict-caution bg-verdict-caution-surface p-5"
    >
      <h2 id="temporary-password-title" className="text-base font-semibold">
        Pass this temporary password on now — it will not be shown again
      </h2>
      <p className="mt-1 text-sm">
        Give it to {officerName} in person or by a route you trust. They sign in
        with it once and must then choose their own. If it is lost, issue
        another.
      </p>
      <p
        className="mt-3 select-all rounded-md border border-line bg-surface px-3 py-2 font-mono text-base tracking-wide"
        aria-label="Temporary password"
      >
        {password}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(password);
              setCopy("copied");
            } catch {
              setCopy("failed");
            }
          }}
        >
          Copy
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          I have passed it on
        </Button>
        <span role="status" className="text-sm">
          {copy === "copied"
            ? "Copied."
            : copy === "failed"
              ? "Could not copy. Select it and copy it by hand."
              : ""}
        </span>
      </div>
    </section>
  );
}

const LEVEL_LABELS: Record<string, string> = {
  COUNCIL: "Council",
  ZONE: "Zone",
  BRANCH: "Branch",
  UNIT: "Unit",
};

export function levelLabel(level: string): string {
  return LEVEL_LABELS[level] ?? level;
}

interface FlatNode {
  id: string;
  name: string;
  level: string;
  depth: number;
}

function flatten(nodes: OrganisationTreeNode[], out: FlatNode[] = []) {
  for (const node of nodes) {
    if (node.isActive) {
      out.push({
        id: node.id,
        name: node.name,
        level: node.level,
        depth: node.depth,
      });
      flatten(node.children, out);
    }
  }
  return out;
}

/**
 * Chooses the part of the Union a role or permission applies to. It applies
 * to that organisation and everything beneath it (Decision 9.4), so the
 * hierarchy is shown, not a flat list.
 */
export function OrganisationPicker({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const { data } = useSWR<{ organisations: OrganisationTreeNode[] }>(
    "/organisations",
    fetcher,
  );
  const nodes = flatten(data?.organisations ?? []);

  return (
    <Field
      label="Applies to"
      htmlFor={id}
      required
      hint="The council, zone, branch, or unit it covers, with everything beneath it."
    >
      <Select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Select part of the Union</option>
        {nodes.map((node) => (
          <option key={node.id} value={node.id}>
            {" ".repeat(node.depth)}
            {node.name} ({levelLabel(node.level)})
          </option>
        ))}
      </Select>
    </Field>
  );
}

/**
 * Permissions to tick, several at once (item 56). Used to give an officer
 * permissions and to compose a role, so the two lists read the same. A ticked
 * permission stays ticked while the filter hides it.
 */
export function PermissionChecklist({
  idPrefix,
  entries,
  value,
  onChange,
  legend,
  hint,
  required = false,
  filterable = false,
  note,
}: {
  idPrefix: string;
  entries: readonly { code: string; description: string }[];
  value: readonly string[];
  onChange: (next: string[]) => void;
  legend: string;
  hint?: string;
  required?: boolean;
  filterable?: boolean;
  /** A word beside an entry, such as where it is already in place. */
  note?: (code: string) => string | null;
}) {
  const [query, setQuery] = useState("");
  const shown = entries.filter((entry) => matchesPermission(entry, query));

  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium">
        {legend}
        {required ? (
          <span className="ml-1 text-verdict-deny" aria-hidden>
            *
          </span>
        ) : null}
        {value.length > 0 ? (
          <span className="ml-2 font-normal text-muted-foreground">
            {value.length} chosen
          </span>
        ) : null}
      </legend>
      {hint ? <p className="text-xs text-faint-foreground">{hint}</p> : null}
      {filterable ? (
        <TextInput
          id={`${idPrefix}-filter`}
          aria-label="Find a permission"
          placeholder="Find a permission"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      ) : null}
      <div className="grid max-h-96 gap-2 overflow-y-auto sm:grid-cols-2">
        {shown.map((entry) => {
          const id = `${idPrefix}-${entry.code.replace(/\W/g, "-")}`;
          const checked = value.includes(entry.code);
          const extra = note?.(entry.code);
          return (
            <label
              key={entry.code}
              htmlFor={id}
              className="flex cursor-pointer items-start gap-2.5 rounded-md border border-line px-3 py-2"
            >
              <input
                id={id}
                type="checkbox"
                className="mt-1"
                checked={checked}
                onChange={() =>
                  onChange(
                    checked
                      ? value.filter((held) => held !== entry.code)
                      : [...value, entry.code],
                  )
                }
              />
              <span>
                <span className="block text-sm">{entry.description}</span>
                <span className="block font-mono text-xs text-faint-foreground">
                  {entry.code}
                  {needsSecondFactor(entry.code)
                    ? " · needs a second factor"
                    : ""}
                  {extra ? ` · ${extra}` : ""}
                </span>
              </span>
            </label>
          );
        })}
        {shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No permission matches that.
          </p>
        ) : null}
      </div>
    </fieldset>
  );
}
