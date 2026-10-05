"use client";

import type { IssuedTemporaryPassword, UserSummary } from "@nurtw/contracts";
import { UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import useSWR from "swr";

import { explained } from "@/components/api-access";
import { TemporaryPassword, levelLabel } from "@/components/officers";
import {
  Button,
  EmptyState,
  ErrorNotice,
  Field,
  ListToolbar,
  Loading,
  PageHeader,
  StatusChip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TextInput,
  listCount,
} from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError, api, fetcher } from "@/lib/api";
import { useSession } from "@/lib/session";

/**
 * Officer accounts (PRD §16, item 28).
 *
 * Creating an account gives the officer a way in and nothing more: it starts
 * with no role. Roles and single permissions are given on the officer's own
 * page, each within a part of the Union.
 */
function AddOfficerDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (issued: IssuedTemporaryPassword) => Promise<unknown>;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  function close(next: boolean) {
    if (!next) {
      setFullName("");
      setEmail("");
      setError(null);
    }
    onOpenChange(next);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const issued = await api.post<IssuedTemporaryPassword>("/users", {
        fullName,
        email,
      });
      await onCreated(issued);
      close(false);
    } catch (caught) {
      setError(explained(caught, "An account with that email already exists."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>Add an officer</DialogTitle>
            <DialogDescription>
              The System issues a temporary password for you to pass on. The
              officer chooses their own at first sign-in. The account starts
              with no role.
            </DialogDescription>
          </DialogHeader>
          {error && error.details.length === 0 ? (
            <ErrorNotice message={error.message} requestId={error.requestId} />
          ) : null}
          <Field
            label="Full name"
            htmlFor="officerName"
            required
            error={error?.fieldError("fullName")}
          >
            <TextInput
              id="officerName"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              maxLength={200}
              autoFocus
            />
          </Field>
          <Field
            label="Official email address"
            htmlFor="officerEmail"
            required
            hint="What they sign in with."
            error={error?.fieldError("email")}
          >
            <TextInput
              id="officerEmail"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => close(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                busy || fullName.trim().length < 2 || !email.includes("@")
              }
            >
              {busy ? "Adding…" : "Add officer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function OfficersPage() {
  const { holds } = useSession();
  const [issued, setIssued] = useState<IssuedTemporaryPassword | null>(null);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");

  const { data, error, isLoading, mutate } = useSWR<{ users: UserSummary[] }>(
    holds("user.read") ? "/users" : null,
    fetcher,
  );
  const users = data?.users ?? [];
  const loadError = error instanceof ApiError ? error : null;
  const wanted = search.trim().toLowerCase();
  const shown = users.filter(
    (user) =>
      wanted === "" ||
      user.fullName.toLowerCase().includes(wanted) ||
      user.email.toLowerCase().includes(wanted),
  );
  const add = holds("user.manage") ? (
    <Button type="button" onClick={() => setAdding(true)}>
      <UserPlus aria-hidden />
      Add an officer
    </Button>
  ) : null;

  return (
    <div className="grid max-w-5xl gap-6">
      <PageHeader
        title="Officers"
        description="Who may sign in, and what each may do. Every change needs a reason and is recorded in the audit trail."
        actions={add}
      />

      {issued ? (
        <TemporaryPassword
          password={issued.temporaryPassword}
          officerName={issued.user.fullName}
          onDone={() => setIssued(null)}
        />
      ) : null}

      {loadError ? (
        <ErrorNotice
          message={loadError.message}
          requestId={loadError.requestId}
        />
      ) : null}

      {isLoading ? (
        <Loading />
      ) : users.length === 0 && !loadError ? (
        <EmptyState
          icon={<Users aria-hidden />}
          title="No officers to show"
          description="An officer you add appears here, with no role until you give one."
          action={add}
        />
      ) : users.length > 0 ? (
        <>
          <ListToolbar count={listCount(shown.length, users.length)}>
            <div className="min-w-48 flex-1 sm:max-w-xs">
              <label htmlFor="officerSearch" className="sr-only">
                Search officers by name or email
              </label>
              <TextInput
                id="officerSearch"
                type="search"
                placeholder="Search by name or email"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </ListToolbar>

          {shown.length === 0 ? (
            <EmptyState
              title="None match"
              description="No officer has that name or email. Clear the search to see them all."
            />
          ) : (
            <Table stacked className="sm:min-w-[44rem]">
              <TableHead>
                <tr>
                  <TableHeader>Officer</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader>Roles</TableHeader>
                  <TableHeader>Second factor</TableHeader>
                </tr>
              </TableHead>
              <TableBody>
                {shown.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <Link
                        href={`/settings/users/${user.id}`}
                        className="font-medium text-link underline-offset-2 hover:underline"
                      >
                        {user.fullName}
                      </Link>
                      <span className="block text-xs text-faint-foreground">
                        {user.email}
                      </span>
                    </TableCell>
                    <TableCell label="Status">
                      <span>
                        <StatusChip
                          status={user.isActive ? "ACTIVE" : "DEACTIVATED"}
                        />
                        {user.mustChangePassword ? (
                          <span className="mt-1 block text-xs text-faint-foreground">
                            On a temporary password
                          </span>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell label="Roles" className="text-muted-foreground">
                      {user.roles.length === 0 ? (
                        <span className="text-xs italic text-faint-foreground">
                          None
                        </span>
                      ) : (
                        <ul className="grid gap-0.5">
                          {user.roles.map((role) => (
                            <li key={role.id}>
                              {role.role.label}
                              <span className="text-xs text-faint-foreground">
                                {" "}
                                · {role.organisation.name} (
                                {levelLabel(role.organisation.level)})
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </TableCell>
                    <TableCell
                      label="Second factor"
                      className="text-muted-foreground"
                    >
                      {user.secondFactorEnrolled ? "Set up" : "Not set up"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </>
      ) : null}

      <AddOfficerDialog
        open={adding}
        onOpenChange={setAdding}
        onCreated={async (created) => {
          setIssued(created);
          await mutate();
        }}
      />
    </div>
  );
}
