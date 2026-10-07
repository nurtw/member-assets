"use client";

import type { LgaEntry, MasterDataEntry } from "@nurtw/contracts";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpToLine,
  Ellipsis,
  ListChecks,
  Pencil,
  Plus,
  Power,
  PowerOff,
} from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import useSWR from "swr";

import {
  Button,
  EmptyState,
  ErrorNotice,
  Field,
  ListToolbar,
  Loading,
  StatusChip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TextInput,
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ApiError, api, fetcher } from "@/lib/api";
import {
  asCode,
  isCode,
  moved,
  orderAtEnd,
  type Move,
} from "@/lib/reference-list";
import { useSession } from "@/lib/session";

/**
 * One of the Union's reference lists (item 39): what is offered wherever a
 * form asks for a designation, a vehicle type, a route type, or a local
 * government area.
 *
 * Three rules of the API shape every control here (PRD §23.4):
 *
 * - **A code is set once.** It is a key that records and the legacy import
 *   refer to, so it is shown and never offered for editing.
 * - **Nothing is deleted.** An entry is switched off: records that carry it
 *   keep it, and it stops being offered for new ones.
 * - **The lists are Union-wide.** They belong to no branch, so whoever may
 *   manage them manages all of them.
 *
 * The acts are offered to a holder of `master_data.manage`. The API decides.
 */

/** What a refusal means for the act just tried: the API's own words are generic. */
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
      "You may not change the reference lists.",
      caught.requestId,
    );
  }
  return caught;
}

const CODE_TAKEN =
  "That code is already in use. If its entry was switched off, switch it on again instead of adding another.";

function RowMenu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Change ${label}`}
        >
          <Ellipsis aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The switch-off and switch-on dialog, which both kinds of list share. */
function StatusDialog({
  name,
  active,
  onClose,
  onConfirm,
}: {
  name: string;
  active: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={active ? `Switch off ${name}?` : `Switch ${name} on again?`}
      description={
        active ? (
          <p>
            Nothing is deleted. Records that already carry it keep it, and it is
            no longer offered when a new one is made. It can be switched on
            again.
          </p>
        ) : (
          <p>It is offered again wherever this list is used.</p>
        )
      }
      confirmLabel={active ? "Switch it off" : "Switch it on"}
      tone={active ? "danger" : "primary"}
      onConfirm={onConfirm}
    />
  );
}

// --- Designations, vehicle types, route types --------------------------------

type CodedAct =
  | { kind: "ADD" }
  | { kind: "EDIT"; entry: MasterDataEntry }
  | { kind: "STATUS"; entry: MasterDataEntry };

function CodedDialog({
  collection,
  noun,
  act,
  orderForNew,
  onClose,
  onDone,
}: {
  collection: string;
  noun: string;
  act: Extract<CodedAct, { kind: "ADD" | "EDIT" }>;
  orderForNew: number;
  onClose: () => void;
  onDone: (message: string) => Promise<void>;
}) {
  const editing = act.kind === "EDIT" ? act.entry : null;
  const [code, setCode] = useState(editing?.code ?? "");
  const [label, setLabel] = useState(editing?.label ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const trimmed = label.trim();
  const ready = editing
    ? trimmed.length > 0 && trimmed !== editing.label
    : trimmed.length > 0 && isCode(code);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await api.patch(`/master-data/${collection}/${editing.id}`, {
          label: trimmed,
        });
        await onDone(`Now reads “${trimmed}”`);
      } else {
        await api.post(`/master-data/${collection}`, {
          code,
          label: trimmed,
          sortOrder: orderForNew,
        });
        await onDone(`${trimmed} added`);
      }
      onClose();
    } catch (caught) {
      setError(explain(caught, CODE_TAKEN));
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
              {editing ? `Change ${editing.label}` : `Add a ${noun}`}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "The label is what officers see and what is printed. The code stays as it is."
                : "It goes to the end of the list, and is offered at once wherever this list is used."}
            </DialogDescription>
          </DialogHeader>
          {error && error.details.length === 0 ? (
            <ErrorNotice message={error.message} requestId={error.requestId} />
          ) : null}
          <Field
            label="Label"
            htmlFor="referenceLabel"
            required
            hint="As the Union writes it."
            error={error?.fieldError("label")}
          >
            <TextInput
              id="referenceLabel"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              maxLength={160}
              autoFocus
            />
          </Field>
          {editing ? (
            <Field
              label="Code"
              htmlFor="referenceCode"
              hint="Set when the entry was added. It cannot be changed."
            >
              <TextInput
                id="referenceCode"
                value={editing.code}
                readOnly
                className="font-mono"
              />
            </Field>
          ) : (
            <Field
              label="Code"
              htmlFor="referenceCode"
              required
              hint="Capital letters, digits, and underscores, beginning with a letter. It cannot be changed afterwards."
              error={error?.fieldError("code")}
            >
              <TextInput
                id="referenceCode"
                value={code}
                onChange={(event) => setCode(asCode(event.target.value))}
                maxLength={64}
                className="font-mono"
                autoCapitalize="characters"
                spellCheck={false}
              />
            </Field>
          )}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !ready}>
              {busy
                ? "Saving…"
                : editing
                  ? "Save the label"
                  : `Add the ${noun}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CodedList({
  collection,
  noun,
  plural,
  note,
}: {
  /** As the API names it: `designations`, `vehicle-categories`, `route-types`. */
  collection: string;
  /** "designation", for a button and a dialog. */
  noun: string;
  /** "designations", for an empty list. */
  plural: string;
  /** Something an officer should know about this list, above it. */
  note?: ReactNode;
}) {
  const { holds } = useSession();
  const manages = holds("master_data.manage");
  const [act, setAct] = useState<CodedAct | null>(null);
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState<ApiError | null>(null);

  const { data, error, isLoading, mutate } = useSWR<{
    entries: MasterDataEntry[];
  }>(`/master-data/${collection}?includeInactive=true`, fetcher);
  const entries = data?.entries ?? [];
  const loadError = error instanceof ApiError ? error : null;
  const inUse = entries.filter((entry) => entry.isActive).length;

  async function done(message: string) {
    await mutate();
    toast.success(message);
  }

  /** Saves the order number of each entry the move displaces, one at a time. */
  async function move(entry: MasterDataEntry, how: Move) {
    setMoving(true);
    setMoveError(null);
    try {
      for (const change of moved(entries, entry.id, how)) {
        await api.patch(`/master-data/${collection}/${change.id}`, {
          sortOrder: change.sortOrder,
        });
      }
      await mutate();
      toast.success(`${entry.label} moved`);
    } catch (caught) {
      // Some of the numbers may have been saved. The list is read again, so
      // what shows is what is stored.
      await mutate();
      setMoveError(explain(caught, "The order could not be saved."));
    } finally {
      setMoving(false);
    }
  }

  const add = manages ? (
    <Button type="button" onClick={() => setAct({ kind: "ADD" })}>
      <Plus aria-hidden />
      Add a {noun}
    </Button>
  ) : null;

  return (
    <div className="grid gap-4">
      {note}

      <ListToolbar
        count={
          data
            ? `${entries.length} in all, ${inUse} offered on forms`
            : undefined
        }
      >
        {add}
      </ListToolbar>

      {loadError ? (
        <ErrorNotice
          message={loadError.message}
          requestId={loadError.requestId}
        />
      ) : null}
      {moveError ? (
        <ErrorNotice
          message={moveError.message}
          requestId={moveError.requestId}
        />
      ) : null}

      {isLoading ? (
        <Loading />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<ListChecks aria-hidden />}
          title={`No ${plural} yet`}
          description={`Forms that ask for a ${noun} offer nothing until one is added.`}
          action={add}
        />
      ) : (
        <Table stacked className="sm:min-w-[36rem]">
          <TableHead>
            <tr>
              <TableHeader>Label</TableHeader>
              <TableHeader>Code</TableHeader>
              <TableHeader>Status</TableHeader>
              {manages ? (
                <TableHeader>
                  <span className="sr-only">Change</span>
                </TableHeader>
              ) : null}
            </tr>
          </TableHead>
          <TableBody>
            {entries.map((entry, index) => (
              <TableRow key={entry.id}>
                <TableCell className="font-medium">{entry.label}</TableCell>
                <TableCell
                  label="Code"
                  className="font-mono text-xs text-muted-foreground"
                >
                  {entry.code}
                </TableCell>
                <TableCell label="Status">
                  <StatusChip status={entry.isActive ? "ACTIVE" : "INACTIVE"} />
                </TableCell>
                {manages ? (
                  <TableCell label="Change" className="sm:text-right">
                    <RowMenu label={entry.label}>
                      <DropdownMenuItem
                        onSelect={() => setAct({ kind: "EDIT", entry })}
                      >
                        <Pencil aria-hidden />
                        Change the label
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled={moving || index === 0}
                        onSelect={() => void move(entry, "TOP")}
                      >
                        <ArrowUpToLine aria-hidden />
                        Move to the top
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={moving || index === 0}
                        onSelect={() => void move(entry, "UP")}
                      >
                        <ArrowUp aria-hidden />
                        Move up
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={moving || index === entries.length - 1}
                        onSelect={() => void move(entry, "DOWN")}
                      >
                        <ArrowDown aria-hidden />
                        Move down
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => setAct({ kind: "STATUS", entry })}
                      >
                        {entry.isActive ? (
                          <PowerOff aria-hidden />
                        ) : (
                          <Power aria-hidden />
                        )}
                        {entry.isActive ? "Switch off" : "Switch on again"}
                      </DropdownMenuItem>
                    </RowMenu>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {act?.kind === "ADD" || act?.kind === "EDIT" ? (
        <CodedDialog
          key={act.kind === "EDIT" ? act.entry.id : "new"}
          collection={collection}
          noun={noun}
          act={act}
          orderForNew={orderAtEnd(entries)}
          onClose={() => setAct(null)}
          onDone={done}
        />
      ) : null}

      {act?.kind === "STATUS" ? (
        <StatusDialog
          name={act.entry.label}
          active={act.entry.isActive}
          onClose={() => setAct(null)}
          onConfirm={async () => {
            const on = !act.entry.isActive;
            try {
              await api.patch(`/master-data/${collection}/${act.entry.id}`, {
                isActive: on,
              });
            } catch (caught) {
              throw explain(
                caught,
                "It could not be changed. Reload the page.",
              );
            }
            await done(
              `${act.entry.label} switched ${on ? "on again" : "off"}`,
            );
          }}
        />
      ) : null}
    </div>
  );
}

// --- Local government areas --------------------------------------------------

type LgaAct =
  | { kind: "ADD" }
  | { kind: "EDIT"; lga: LgaEntry }
  | { kind: "STATUS"; lga: LgaEntry };

function LgaDialog({
  act,
  onClose,
  onDone,
}: {
  act: Extract<LgaAct, { kind: "ADD" | "EDIT" }>;
  onClose: () => void;
  onDone: (message: string) => Promise<void>;
}) {
  const editing = act.kind === "EDIT" ? act.lga : null;
  const [code, setCode] = useState(editing?.code ?? "");
  const [name, setName] = useState(editing?.name ?? "");
  const [stateName, setStateName] = useState(editing?.stateName ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const cleanName = name.trim();
  const cleanState = stateName.trim();
  const ready = editing
    ? cleanName.length > 0 &&
      cleanState.length > 0 &&
      (cleanName !== editing.name ||
        cleanState.toUpperCase() !== editing.stateName.toUpperCase())
    : cleanName.length > 0 && cleanState.length > 0 && isCode(code);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await api.patch(`/master-data/lgas/${editing.id}`, {
          ...(cleanName !== editing.name ? { name: cleanName } : {}),
          ...(cleanState.toUpperCase() !== editing.stateName.toUpperCase()
            ? { stateName: cleanState }
            : {}),
        });
        await onDone(`${cleanName} saved`);
      } else {
        await api.post("/master-data/lgas", {
          code,
          name: cleanName,
          stateName: cleanState,
        });
        await onDone(`${cleanName} added`);
      }
      onClose();
    } catch (caught) {
      setError(explain(caught, CODE_TAKEN));
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
              {editing
                ? `Change ${editing.name}`
                : "Add a local government area"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "The name and the state can be corrected. The code stays as it is."
                : "It is offered at once wherever a form asks where somebody lives."}
            </DialogDescription>
          </DialogHeader>
          {error && error.details.length === 0 ? (
            <ErrorNotice message={error.message} requestId={error.requestId} />
          ) : null}
          <Field
            label="Name"
            htmlFor="lgaName"
            required
            error={error?.fieldError("name")}
          >
            <TextInput
              id="lgaName"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={160}
              autoFocus
            />
          </Field>
          <Field
            label="State"
            htmlFor="lgaState"
            required
            hint="It is kept in capital letters."
            error={error?.fieldError("stateName")}
          >
            <TextInput
              id="lgaState"
              value={stateName}
              onChange={(event) => setStateName(event.target.value)}
              maxLength={80}
            />
          </Field>
          {editing ? (
            <Field
              label="Code"
              htmlFor="lgaCode"
              hint="Set when the entry was added. It cannot be changed."
            >
              <TextInput
                id="lgaCode"
                value={editing.code}
                readOnly
                className="font-mono"
              />
            </Field>
          ) : (
            <Field
              label="Code"
              htmlFor="lgaCode"
              required
              hint="Capital letters, digits, and underscores, beginning with a letter. It cannot be changed afterwards."
              error={error?.fieldError("code")}
            >
              <TextInput
                id="lgaCode"
                value={code}
                onChange={(event) => setCode(asCode(event.target.value))}
                maxLength={64}
                className="font-mono"
                autoCapitalize="characters"
                spellCheck={false}
              />
            </Field>
          )}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !ready}>
              {busy ? "Saving…" : editing ? "Save" : "Add the area"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function LgaList() {
  const { holds } = useSession();
  const manages = holds("master_data.manage");
  const [act, setAct] = useState<LgaAct | null>(null);

  const { data, error, isLoading, mutate } = useSWR<{ lgas: LgaEntry[] }>(
    "/master-data/lgas?includeInactive=true",
    fetcher,
  );
  const lgas = data?.lgas ?? [];
  const loadError = error instanceof ApiError ? error : null;
  const inUse = lgas.filter((lga) => lga.isActive).length;

  async function done(message: string) {
    await mutate();
    toast.success(message);
  }

  const add = manages ? (
    <Button type="button" onClick={() => setAct({ kind: "ADD" })}>
      <Plus aria-hidden />
      Add an area
    </Button>
  ) : null;

  return (
    <div className="grid gap-4">
      <ListToolbar
        count={
          data ? `${lgas.length} in all, ${inUse} offered on forms` : undefined
        }
      >
        {add}
      </ListToolbar>

      {loadError ? (
        <ErrorNotice
          message={loadError.message}
          requestId={loadError.requestId}
        />
      ) : null}

      {isLoading ? (
        <Loading />
      ) : lgas.length === 0 ? (
        <EmptyState
          icon={<ListChecks aria-hidden />}
          title="No local government areas yet"
          description="Forms that ask where somebody lives offer nothing until one is added."
          action={add}
        />
      ) : (
        <Table stacked className="sm:min-w-[36rem]">
          <TableHead>
            <tr>
              <TableHeader>Name</TableHeader>
              <TableHeader>State</TableHeader>
              <TableHeader>Code</TableHeader>
              <TableHeader>Status</TableHeader>
              {manages ? (
                <TableHeader>
                  <span className="sr-only">Change</span>
                </TableHeader>
              ) : null}
            </tr>
          </TableHead>
          <TableBody>
            {lgas.map((lga) => (
              <TableRow key={lga.id}>
                <TableCell className="font-medium">{lga.name}</TableCell>
                <TableCell label="State" className="text-muted-foreground">
                  {lga.stateName}
                </TableCell>
                <TableCell
                  label="Code"
                  className="font-mono text-xs text-muted-foreground"
                >
                  {lga.code}
                </TableCell>
                <TableCell label="Status">
                  <StatusChip status={lga.isActive ? "ACTIVE" : "INACTIVE"} />
                </TableCell>
                {manages ? (
                  <TableCell label="Change" className="sm:text-right">
                    <RowMenu label={lga.name}>
                      <DropdownMenuItem
                        onSelect={() => setAct({ kind: "EDIT", lga })}
                      >
                        <Pencil aria-hidden />
                        Change
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => setAct({ kind: "STATUS", lga })}
                      >
                        {lga.isActive ? (
                          <PowerOff aria-hidden />
                        ) : (
                          <Power aria-hidden />
                        )}
                        {lga.isActive ? "Switch off" : "Switch on again"}
                      </DropdownMenuItem>
                    </RowMenu>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {act?.kind === "ADD" || act?.kind === "EDIT" ? (
        <LgaDialog
          key={act.kind === "EDIT" ? act.lga.id : "new"}
          act={act}
          onClose={() => setAct(null)}
          onDone={done}
        />
      ) : null}

      {act?.kind === "STATUS" ? (
        <StatusDialog
          name={act.lga.name}
          active={act.lga.isActive}
          onClose={() => setAct(null)}
          onConfirm={async () => {
            const on = !act.lga.isActive;
            try {
              await api.patch(`/master-data/lgas/${act.lga.id}`, {
                isActive: on,
              });
            } catch (caught) {
              throw explain(
                caught,
                "It could not be changed. Reload the page.",
              );
            }
            await done(`${act.lga.name} switched ${on ? "on again" : "off"}`);
          }}
        />
      ) : null}
    </div>
  );
}
