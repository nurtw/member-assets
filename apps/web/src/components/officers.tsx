"use client";

import type { OrganisationTreeNode } from "@nurtw/contracts";
import { useState } from "react";
import useSWR from "swr";

import { Button, Field, Select } from "@/components/ui";
import { fetcher } from "@/lib/api";

/**
 * Pieces shared by the officer screens (item 28): the one-time password
 * panel, and the organisation picker. The sidebar names each screen (item
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
