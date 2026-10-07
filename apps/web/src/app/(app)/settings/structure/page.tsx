"use client";

import type { OrganisationTreeNode } from "@nurtw/contracts";
import {
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  Ellipsis,
  Network,
  Pencil,
  Plus,
  Power,
  PowerOff,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import useSWR from "swr";

import {
  Button,
  EmptyState,
  ErrorNotice,
  Field,
  ListToolbar,
  Loading,
  PageHeader,
  Select,
  StatusChip,
  TextInput,
  listCount,
} from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ApiError, api, fetcher } from "@/lib/api";
import {
  LEVEL_LABELS,
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
} from "@/lib/organisation-tree";
import { useSession } from "@/lib/session";

/**
 * The Union's structure (item 38): the council, its zones, their branches, and
 * the units beneath them.
 *
 * The tree is what `GET /organisations` returned, which the API has already
 * limited to what this officer may read. The acts are offered to a holder of
 * `organisation.manage`; the API decides each one against the node itself, and
 * a move against both ends, so offering an act here is courtesy and never the
 * control.
 *
 * Nothing is deleted from here, and no name is supplied by the System: the
 * Union's branches are the Union's to enter (`QUESTIONS.md` ORG-05).
 */

type Act =
  | { kind: "ADD"; node: OrganisationTreeNode }
  | { kind: "RENAME"; node: OrganisationTreeNode }
  | { kind: "MOVE"; node: OrganisationTreeNode }
  | { kind: "STATUS"; node: OrganisationTreeNode };

/**
 * The API answers every refusal with a generic message (Requirement 14.3), so
 * the screen says what a refusal means for the act just tried.
 */
function explain(caught: unknown, conflict: string): ApiError {
  if (!(caught instanceof ApiError)) {
    return new ApiError(0, "The service could not be reached.");
  }
  if (caught.status === 409) {
    return new ApiError(409, conflict, caught.requestId);
  }
  if (caught.status === 403) {
    return new ApiError(
      403,
      "You may not change this part of the structure.",
      caught.requestId,
    );
  }
  if (caught.status === 404) {
    return new ApiError(
      404,
      "It no longer exists, or it is outside your area of responsibility.",
      caught.requestId,
    );
  }
  return caught;
}

/** Adding beneath a node, or renaming one: a name, and little else. */
function NameDialog({
  act,
  onClose,
  onDone,
}: {
  act: Extract<Act, { kind: "ADD" | "RENAME" }>;
  onClose: () => void;
  onDone: (message: string) => Promise<void>;
}) {
  const { node } = act;
  const adding = act.kind === "ADD";
  const beneath = levelBeneath(node.level);
  const [name, setName] = useState(adding ? "" : node.name);
  const [stateName, setStateName] = useState(node.stateName ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  // PRD §23.2 — the issuing council's state, which the membership card prints.
  const editsState = !adding && node.level === "COUNCIL";
  const trimmed = name.trim();
  const changed = adding
    ? trimmed.length > 0
    : trimmed.length > 0 &&
      (trimmed !== node.name ||
        (editsState && stateName.trim() !== (node.stateName ?? "")));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (adding) {
        await api.post("/organisations", {
          name: trimmed,
          level: beneath,
          parentId: node.id,
        });
        await onDone(`${trimmed} added beneath ${node.name}`);
      } else {
        await api.patch(`/organisations/${node.id}`, {
          ...(trimmed !== node.name ? { name: trimmed } : {}),
          ...(editsState && stateName.trim() !== (node.stateName ?? "")
            ? { stateName: stateName.trim() || null }
            : {}),
        });
        await onDone(`Renamed to ${trimmed}`);
      }
      onClose();
    } catch (caught) {
      setError(
        explain(
          caught,
          adding
            ? `Nothing can be added beneath ${node.name} now. It may have been deactivated a moment ago.`
            : "The name could not be changed. Reload the page and try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>
              {adding && beneath
                ? `Add a ${LEVEL_LABELS[beneath].one} beneath ${node.name}`
                : `Rename ${node.name}`}
            </DialogTitle>
            <DialogDescription>
              {adding && beneath
                ? `What sits beneath a ${LEVEL_LABELS[node.level].one} is a ${LEVEL_LABELS[beneath].one}, so the level is not chosen. Enter the name as the Union uses it.`
                : "The name changes wherever it is shown. Nothing beneath it is moved."}
            </DialogDescription>
          </DialogHeader>
          {error && error.details.length === 0 ? (
            <ErrorNotice message={error.message} requestId={error.requestId} />
          ) : null}
          <Field
            label="Name"
            htmlFor="structureName"
            required
            error={error?.fieldError("name")}
          >
            <TextInput
              id="structureName"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={160}
              autoFocus
            />
          </Field>
          {editsState ? (
            <Field
              label="State"
              htmlFor="structureState"
              hint="The council’s state, as the membership card prints it."
              error={error?.fieldError("stateName")}
            >
              <TextInput
                id="structureState"
                value={stateName}
                onChange={(event) => setStateName(event.target.value)}
                maxLength={80}
              />
            </Field>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !changed}>
              {adding
                ? busy
                  ? "Adding…"
                  : `Add the ${beneath ? LEVEL_LABELS[beneath].one : "node"}`
                : busy
                  ? "Saving…"
                  : "Save the name"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * What stops a change of status, where the tree already shows it. Active
 * members stop a deactivation too, but only the API can count those.
 */
function blocked(
  forest: readonly OrganisationTreeNode[],
  node: OrganisationTreeNode,
): { title: string; text: string } | null {
  if (!node.isActive) {
    return parentIsInactive(forest, node)
      ? {
          title: `${node.name} cannot be activated yet`,
          text: "What it sits beneath is inactive. Activate that first.",
        }
      : null;
  }
  // Counted in the whole forest: a row picked from a search carries only the
  // children the search kept.
  const whole = allNodes(forest).find((entry) => entry.id === node.id) ?? node;
  const active = activeChildren(whole);
  const beneath = levelBeneath(node.level);
  if (active === 0 || !beneath) {
    return null;
  }
  const { one, many } = LEVEL_LABELS[beneath];
  return {
    title: `${node.name} cannot be deactivated yet`,
    text: `It has ${active} active ${active === 1 ? one : many} beneath it. Deactivate ${active === 1 ? "that" : "those"} first, then come back to this one.`,
  };
}

/** Why a change cannot be tried yet, where the tree already shows why. */
function BlockedDialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: string;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{children}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  node,
  depth,
  open,
  manages,
  canMove,
  onToggle,
  onAct,
}: {
  node: OrganisationTreeNode;
  depth: number;
  open: boolean;
  manages: boolean;
  canMove: boolean;
  onToggle: () => void;
  onAct: (act: Act) => void;
}) {
  const beneath = levelBeneath(node.level);
  const summary = childSummary(node);
  const hasChildren = node.children.length > 0;

  return (
    <div
      className="flex items-center gap-2 px-3 py-2"
      style={{ paddingInlineStart: `${0.75 + depth * 1.25}rem` }}
    >
      {hasChildren ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          aria-expanded={open}
          aria-label={
            open
              ? `Hide what is beneath ${node.name}`
              : `Show what is beneath ${node.name}`
          }
          onClick={onToggle}
        >
          {open ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
        </Button>
      ) : (
        <span className="size-8 shrink-0" aria-hidden />
      )}

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium wrap-break-word">{node.name}</span>
          {node.isActive ? null : <StatusChip status="INACTIVE" />}
        </p>
        <p className="text-xs text-muted-foreground">
          {levelName(node.level)}
          {summary ? ` · ${summary}` : ""}
        </p>
      </div>

      {manages ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="shrink-0"
              aria-label={`Change ${node.name}`}
            >
              <Ellipsis aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {beneath && node.isActive ? (
              <DropdownMenuItem onSelect={() => onAct({ kind: "ADD", node })}>
                <Plus aria-hidden />
                Add a {LEVEL_LABELS[beneath].one} beneath
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onSelect={() => onAct({ kind: "RENAME", node })}>
              <Pencil aria-hidden />
              Rename
            </DropdownMenuItem>
            {canMove ? (
              <DropdownMenuItem onSelect={() => onAct({ kind: "MOVE", node })}>
                <CornerDownRight aria-hidden />
                Move
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onSelect={() => onAct({ kind: "STATUS", node })}>
              {node.isActive ? <PowerOff aria-hidden /> : <Power aria-hidden />}
              {node.isActive ? "Deactivate" : "Activate"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

function Branches({
  nodes,
  depth,
  isOpen,
  manages,
  forest,
  onToggle,
  onAct,
}: {
  nodes: readonly OrganisationTreeNode[];
  depth: number;
  isOpen: (id: string) => boolean;
  manages: boolean;
  /** The whole forest, unfiltered: where a move may go is decided from it. */
  forest: readonly OrganisationTreeNode[];
  onToggle: (id: string) => void;
  onAct: (act: Act) => void;
}) {
  return (
    <ul
      className={depth === 0 ? "divide-y divide-line" : "border-t border-line"}
    >
      {nodes.map((node) => {
        const open = isOpen(node.id);
        return (
          <li
            key={node.id}
            className={
              depth === 0 ? undefined : "border-b border-line last:border-b-0"
            }
          >
            <Row
              node={node}
              depth={depth}
              open={open}
              manages={manages}
              canMove={moveDestinations(forest, node).length > 0}
              onToggle={() => onToggle(node.id)}
              onAct={onAct}
            />
            {open && node.children.length > 0 ? (
              <Branches
                nodes={node.children}
                depth={depth + 1}
                isOpen={isOpen}
                manages={manages}
                forest={forest}
                onToggle={onToggle}
                onAct={onAct}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export default function UnionStructurePage() {
  const { holds } = useSession();
  const manages = holds("organisation.manage");
  const [query, setQuery] = useState("");
  // `null` until the officer opens or closes something: the heads are open.
  const [opened, setOpened] = useState<ReadonlySet<string> | null>(null);
  const [act, setAct] = useState<Act | null>(null);
  const [destinationId, setDestinationId] = useState("");

  const { data, error, isLoading, mutate } = useSWR<{
    organisations: OrganisationTreeNode[];
  }>("/organisations", fetcher);
  const forest = data?.organisations ?? [];
  const loadError = error instanceof ApiError ? error : null;

  const searching = query.trim() !== "";
  const shown = filterForest(forest, query);
  const total = allNodes(forest).length;
  // While a search is showing, every match is opened to; the officer's own
  // choices come back when the search is cleared.
  const openIds = searching
    ? new Set(parentIds(shown))
    : (opened ?? new Set(initiallyOpen(forest)));

  function toggle(id: string) {
    const next = new Set(openIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setOpened(next);
  }

  function begin(next: Act) {
    setDestinationId("");
    setAct(next);
  }

  /** After a change: the tree is read again, and a parent added to is opened. */
  async function done(message: string, openId?: string) {
    await mutate();
    if (openId) {
      setOpened(new Set([...openIds, openId]));
    }
    toast.success(message);
  }

  const destinations =
    act?.kind === "MOVE" ? moveDestinations(forest, act.node) : [];
  const statusBlock = act?.kind === "STATUS" ? blocked(forest, act.node) : null;

  return (
    <div className="grid max-w-4xl gap-6">
      <PageHeader
        title="Union structure"
        description="The council, its zones, their branches, and the units beneath them. Every member, vehicle, and officer’s responsibility hangs from one of these."
      />

      <ListToolbar
        count={data ? listCount(allNodes(shown).length, total) : undefined}
      >
        <div className="min-w-48 flex-1 sm:max-w-xs">
          <label htmlFor="q" className="sr-only">
            Find by name
          </label>
          <TextInput
            id="q"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find by name"
          />
        </div>
      </ListToolbar>

      {loadError ? (
        <ErrorNotice
          message={loadError.message}
          requestId={loadError.requestId}
        />
      ) : null}

      {isLoading ? (
        <Loading />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<Network aria-hidden />}
          title={searching ? "Nothing by that name" : "Nothing to show"}
          description={
            searching
              ? "No part of the structure you may see has that name."
              : "No part of the Union’s structure is within your area of responsibility."
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <Branches
            nodes={shown}
            depth={0}
            isOpen={(id) => openIds.has(id)}
            manages={manages}
            forest={forest}
            onToggle={toggle}
            onAct={begin}
          />
        </div>
      )}

      {act?.kind === "ADD" || act?.kind === "RENAME" ? (
        <NameDialog
          // A new dialog for each node, so one node's name never opens another's.
          key={`${act.kind}-${act.node.id}`}
          act={act}
          onClose={() => setAct(null)}
          onDone={(message) =>
            done(message, act.kind === "ADD" ? act.node.id : undefined)
          }
        />
      ) : null}

      {act?.kind === "MOVE" ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setAct(null)}
          title={`Move ${act.node.name}?`}
          description={
            <p>
              Everything beneath it moves with it, and so do its members and
              vehicles. Officers whose responsibility covers where it goes will
              see them; officers who covered where it was will not.
            </p>
          }
          confirmLabel="Move it"
          tone="primary"
          reason={{}}
          onConfirm={async (reason) => {
            if (!destinationId) {
              throw new ApiError(400, "Choose where it moves to.");
            }
            const to = destinations.find((entry) => entry.id === destinationId);
            try {
              await api.patch(`/organisations/${act.node.id}/parent`, {
                parentId: destinationId,
                reason,
              });
            } catch (caught) {
              throw explain(
                caught,
                "It cannot be moved there. The destination may have been deactivated or moved a moment ago. Reload the page and try again.",
              );
            }
            await done(
              `${act.node.name} moved beneath ${to?.name ?? "its new parent"}`,
              destinationId,
            );
          }}
        >
          <Field
            label="Move it beneath"
            htmlFor="structureDestination"
            required
          >
            <Select
              id="structureDestination"
              value={destinationId}
              onChange={(event) => setDestinationId(event.target.value)}
            >
              <option value="">Choose…</option>
              {destinations.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.within
                    ? `${entry.name} (${entry.within})`
                    : entry.name}
                </option>
              ))}
            </Select>
          </Field>
        </ConfirmDialog>
      ) : null}

      {act?.kind === "STATUS" && statusBlock ? (
        <BlockedDialog title={statusBlock.title} onClose={() => setAct(null)}>
          {statusBlock.text}
        </BlockedDialog>
      ) : null}

      {act?.kind === "STATUS" && !statusBlock ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setAct(null)}
          title={
            act.node.isActive
              ? `Deactivate ${act.node.name}?`
              : `Activate ${act.node.name}?`
          }
          description={
            act.node.isActive ? (
              <p>
                Nothing is deleted, and its history is kept. No new member can
                be registered into it, and nothing can be added beneath it,
                until it is activated again.
              </p>
            ) : (
              <p>
                It can be used again: members can be registered into it, and
                more can be added beneath it.
              </p>
            )
          }
          confirmLabel={act.node.isActive ? "Deactivate it" : "Activate it"}
          tone={act.node.isActive ? "danger" : "primary"}
          reason={{}}
          onConfirm={async (reason) => {
            const activating = !act.node.isActive;
            try {
              await api.patch(`/organisations/${act.node.id}/status`, {
                isActive: activating,
                reason,
              });
            } catch (caught) {
              throw explain(
                caught,
                activating
                  ? "It cannot be activated. What it sits beneath may be inactive."
                  : "It still has active members, or something beneath it is still active. It can be deactivated once none is.",
              );
            }
            await done(
              `${act.node.name} ${activating ? "activated" : "deactivated"}`,
            );
          }}
        />
      ) : null}
    </div>
  );
}
