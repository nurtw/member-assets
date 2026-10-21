"use client";

import {
  PERMISSIONS,
  type IssuedTemporaryPassword,
  type OrganisationTreeNode,
  type RoleSummary,
  type UserDetail,
  type UserScopedPermission,
} from "@nurtw/contracts";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import useSWR from "swr";

import { explained, shortDay } from "@/components/api-access";
import {
  OrganisationPicker,
  PermissionChecklist,
  TemporaryPassword,
  levelLabel,
} from "@/components/officers";
import {
  Button,
  Detail,
  DetailList,
  ErrorNotice,
  Field,
  Loading,
  Notice,
  PageHeader,
  Section,
  Select,
  StatusChip,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextInput,
} from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ApiError, api, fetcher } from "@/lib/api";
import { notInPlace, placeNote } from "@/lib/officer-access";
import { widestScope } from "@/lib/organisation-tree";
import { useSession } from "@/lib/session";
import { useTabParam } from "@/lib/use-tab-param";

/**
 * One officer: their account, and what they may do (PRD §16, item 28).
 *
 * The controls offered follow the administrator's permissions. That is a
 * courtesy: the API refuses regardless, and it also refuses an administrator
 * changing their own access, and giving what they do not hold.
 *
 * The page is a record in tabs (`DESIGN.md` §10). Taking something away, and
 * every change to the account itself, is confirmed in a dialog that asks for
 * the reason there and then.
 */

const TAB_LABELS = {
  roles: "Roles",
  permissions: "Permissions",
  account: "Account",
} as const;
type TabName = keyof typeof TAB_LABELS;

/** An act confirmed in a dialog, with its reason. */
type Confirming =
  | { kind: "ROLE" | "GRANT" | "REVOCATION"; id: string; what: string }
  | { kind: "PASSWORD" | "MFA" | "STATUS" };

const REFUSED =
  "The System refused this. You can only give a role or permission you hold yourself in that part of the Union, and you cannot change your own account here.";

function describe(code: string): string {
  return (
    PERMISSIONS.find((permission) => permission.code === code)?.description ??
    code
  );
}

/** The reason to send: the words typed, or nothing at all (item 56). */
function givenReason(typed: string): { reason?: string } {
  const reason = typed.trim();
  return reason ? { reason } : {};
}

/**
 * Why the access is given. Optional (item 56): one typed is kept with the
 * change and its audit event, and a blank one is sent as none.
 */
function Reason({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <Field
      label="Reason"
      htmlFor={id}
      hint="Optional. Kept with the change in the audit trail."
    >
      <TextInput
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={1000}
      />
    </Field>
  );
}

/** A list of roles, grants, or revocations, each with a remove control. */
function Entries({
  empty,
  children,
}: {
  empty: string;
  children: ReactNode[];
}) {
  return children.length === 0 ? (
    <p className="text-sm italic text-faint-foreground">{empty}</p>
  ) : (
    <ul className="grid gap-2">{children}</ul>
  );
}

function ScopedEntry({
  entry,
  onRemove,
  removeLabel,
  disabled,
}: {
  entry: UserScopedPermission;
  onRemove: (() => void) | null;
  removeLabel: string;
  disabled: boolean;
}) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-line px-3 py-2">
      <div className="text-sm">
        <p className="font-medium">{describe(entry.permission)}</p>
        <p className="font-mono text-xs text-faint-foreground">
          {entry.permission}
        </p>
        <p className="text-xs text-muted-foreground">
          {entry.organisation.name} ({levelLabel(entry.organisation.level)}) ·{" "}
          {shortDay(entry.createdAt)}
          {entry.by ? ` · by ${entry.by.fullName}` : ""}
        </p>
        {entry.reason ? (
          <p className="text-xs text-muted-foreground">
            Reason: {entry.reason}
          </p>
        ) : null}
      </div>
      {onRemove ? (
        <Button
          type="button"
          variant="secondary"
          disabled={disabled}
          onClick={onRemove}
        >
          {removeLabel}
        </Button>
      ) : null}
    </li>
  );
}

export default function OfficerPage() {
  const params = useParams<{ id: string }>();
  const { user: me, holds } = useSession();
  const canManage = holds("user.manage");
  const canGrant = holds("permission.grant");
  const canRevoke = holds("permission.revoke");

  const { data, error, isLoading, mutate } = useSWR<{ user: UserDetail }>(
    `/users/${params.id}`,
    fetcher,
  );
  const officer = data?.user ?? null;
  const loadError = error instanceof ApiError ? error : null;

  const { data: roleList } = useSWR<{ roles: RoleSummary[] }>(
    canManage && holds("role.read") ? "/roles" : null,
    fetcher,
  );
  const roles = roleList?.roles ?? [];

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<ApiError | null>(null);
  const [issued, setIssued] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const [roleCode, setRoleCode] = useState("");
  const [roleScope, setRoleScope] = useState("");
  const [roleReason, setRoleReason] = useState("");
  const [chosenPermissions, setChosenPermissions] = useState<string[]>([]);
  const [permissionScope, setPermissionScope] = useState("");

  // "Applies to" starts at the widest part of the Union this administrator
  // may give access in (item 56): the State Council for the super
  // administrator. Still shown, and changed like any other choice.
  const { data: organisationList } = useSWR<{
    organisations: OrganisationTreeNode[];
  }>(canManage || canGrant || canRevoke ? "/organisations" : null, fetcher);
  const widest = widestScope(organisationList?.organisations ?? []) ?? "";
  const roleScopeChosen = roleScope || widest;
  const permissionScopeChosen = permissionScope || widest;
  const [permissionReason, setPermissionReason] = useState("");

  const tabs: { value: TabName }[] = [
    { value: "roles" },
    { value: "permissions" },
    // An administrator does not manage their own account here.
    ...(canManage && officer && me?.id !== officer.id
      ? [{ value: "account" as const }]
      : []),
  ];
  const [tab, setTab] = useTabParam(tabs);

  async function act(action: () => Promise<unknown>, conflict: string) {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      await mutate();
      return true;
    } catch (caught) {
      const failure = explained(caught, conflict);
      setActionError(
        failure.status === 403
          ? new ApiError(403, REFUSED, failure.requestId)
          : failure,
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) {
    return <Loading label="Loading the officer" />;
  }
  if (!officer) {
    return (
      <div className="grid gap-4">
        <ErrorNotice
          message={
            loadError?.status === 404
              ? "No such officer."
              : (loadError?.message ?? "The officer could not be loaded.")
          }
          requestId={loadError?.requestId}
        />
        <Link
          href="/settings/users"
          className="text-sm underline underline-offset-2"
        >
          Back to officers
        </Link>
      </div>
    );
  }

  const isSelf = me?.id === officer.id;
  const chosenRole = roles.find((role) => role.code === roleCode);
  const base = `/users/${officer.id}`;

  /** What each confirmed act says, and does. A failure is shown in its dialog. */
  function asked(which: Confirming): {
    title: string;
    description: string;
    confirmLabel: string;
    tone: "danger" | "primary";
  } {
    switch (which.kind) {
      case "ROLE":
        return {
          title: "Remove this role?",
          description: `${officer!.fullName} loses ${which.what}. What the role allowed stops at their next request.`,
          confirmLabel: "Remove the role",
          tone: "danger",
        };
      case "GRANT":
        return {
          title: "Withdraw this permission?",
          description: `${officer!.fullName} loses the permission granted to them alone: ${which.what}. Any role that gives it still does.`,
          confirmLabel: "Withdraw the grant",
          tone: "danger",
        };
      case "REVOCATION":
        return {
          title: "Lift this revocation?",
          description: `${officer!.fullName} may again hold ${which.what}, if a role or a grant gives it.`,
          confirmLabel: "Lift the revocation",
          tone: "primary",
        };
      case "PASSWORD":
        return {
          title: "Issue a temporary password?",
          description: `${officer!.fullName}'s present password stops working. The System shows a temporary one once, for you to pass on; they choose their own at their next sign-in.`,
          confirmLabel: "Issue a temporary password",
          tone: "primary",
        };
      case "MFA":
        return {
          title: "Remove the second factor?",
          description: `For a lost phone. ${officer!.fullName} signs in with a password alone until they set a second factor up again.`,
          confirmLabel: "Remove second factor",
          tone: "danger",
        };
      case "STATUS":
        return officer!.isActive
          ? {
              title: "Deactivate this account?",
              description: `${officer!.fullName} is signed out at once and cannot sign in. The account and its history are kept.`,
              confirmLabel: "Deactivate",
              tone: "danger",
            }
          : {
              title: "Reactivate this account?",
              description: `${officer!.fullName} may sign in again, with the roles and permissions shown here.`,
              confirmLabel: "Reactivate",
              tone: "primary",
            };
    }
  }

  async function confirmed(which: Confirming, reason: string) {
    const [path, conflict, done] =
      which.kind === "ROLE"
        ? [
            `${base}/roles/${which.id}/remove`,
            "That role had already been removed.",
            "Role removed",
          ]
        : which.kind === "GRANT"
          ? [
              `${base}/grants/${which.id}/withdraw`,
              "That grant had already been withdrawn.",
              "Grant withdrawn",
            ]
          : which.kind === "REVOCATION"
            ? [
                `${base}/revocations/${which.id}/lift`,
                "That revocation had already been lifted.",
                "Revocation lifted",
              ]
            : which.kind === "PASSWORD"
              ? [
                  `${base}/password/reset`,
                  "The password could not be reset.",
                  "Temporary password issued",
                ]
              : which.kind === "MFA"
                ? [
                    `${base}/mfa/reset`,
                    "The officer has no second factor set up.",
                    "Second factor removed",
                  ]
                : [
                    `${base}/status`,
                    "The account's status has changed since the page loaded.",
                    officer!.isActive
                      ? "Account deactivated"
                      : "Account reactivated",
                  ];
    try {
      const answer = await api.post<IssuedTemporaryPassword>(
        path,
        which.kind === "STATUS"
          ? { isActive: !officer!.isActive, reason }
          : { reason },
      );
      if (which.kind === "PASSWORD") {
        setIssued(answer.temporaryPassword);
      }
    } catch (caught) {
      const failure = explained(caught, conflict);
      throw failure.status === 403
        ? new ApiError(403, REFUSED, failure.requestId)
        : failure;
    }
    toast.success(done);
    await mutate();
  }

  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader
        title={officer.fullName}
        back={{ href: "/settings/users", label: "Officers" }}
        status={
          <StatusChip status={officer.isActive ? "ACTIVE" : "DEACTIVATED"} />
        }
        meta={`${officer.email} · added ${shortDay(officer.createdAt)}`}
      />

      {issued ? (
        <TemporaryPassword
          password={issued}
          officerName={officer.fullName}
          onDone={() => setIssued(null)}
        />
      ) : null}

      {actionError ? (
        <ErrorNotice
          message={actionError.message}
          requestId={actionError.requestId}
        />
      ) : null}

      {isSelf ? (
        <Notice tone="info" title="This is your own account">
          Another administrator changes your roles, permissions, and status.
          Your password and second factor are under{" "}
          <Link
            href="/account"
            className="font-medium underline underline-offset-2"
          >
            your account
          </Link>
          .
        </Notice>
      ) : null}

      <Tabs value={tab} onValueChange={setTab} className="grid gap-6">
        <TabsList aria-label="Parts of this officer's record">
          {tabs.map((entry) => (
            <TabsTrigger key={entry.value} value={entry.value}>
              {TAB_LABELS[entry.value]}
              {entry.value === "roles" ? ` (${officer.roles.length})` : ""}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="roles" className="grid gap-6 outline-none">
          <Section
            title="Roles"
            description="A role applies to the part of the Union named and everything beneath it."
          >
            <Entries empty="No role. This officer can sign in and do nothing else.">
              {officer.roles.map((role) => (
                <li
                  key={role.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line px-3 py-2"
                >
                  <div className="text-sm">
                    <p className="font-medium">{role.role.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {role.organisation.name} (
                      {levelLabel(role.organisation.level)}) · since{" "}
                      {shortDay(role.createdAt)}
                    </p>
                  </div>
                  {canManage && !isSelf ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        setConfirming({
                          kind: "ROLE",
                          id: role.id,
                          what: `${role.role.label} in ${role.organisation.name}`,
                        })
                      }
                    >
                      Remove
                    </Button>
                  ) : null}
                </li>
              ))}
            </Entries>

            {canManage && !isSelf ? (
              <div className="grid gap-4 border-t border-line pt-4">
                <Field label="Give a role" htmlFor="roleCode" required>
                  <Select
                    id="roleCode"
                    value={roleCode}
                    onChange={(event) => setRoleCode(event.target.value)}
                  >
                    <option value="">Select a role</option>
                    {roles.map((role) => (
                      <option key={role.code} value={role.code}>
                        {role.label}
                        {role.isSystem ? "" : " (composed)"}
                      </option>
                    ))}
                  </Select>
                </Field>
                {chosenRole ? (
                  <div className="rounded-md bg-surface-muted px-3 py-2 text-xs">
                    {chosenRole.description ? (
                      <p className="mb-1.5 text-muted-foreground">
                        {chosenRole.description}
                      </p>
                    ) : null}
                    <p className="text-muted-foreground">
                      {chosenRole.permissions.map(describe).join(" · ")}
                    </p>
                  </div>
                ) : null}
                <OrganisationPicker
                  id="roleScope"
                  value={roleScopeChosen}
                  onChange={setRoleScope}
                />
                <Reason
                  id="roleReason"
                  value={roleReason}
                  onChange={setRoleReason}
                />
                <div>
                  <Button
                    type="button"
                    disabled={busy || !roleCode || !roleScopeChosen}
                    onClick={async () => {
                      const done = await act(
                        () =>
                          api.post(`${base}/roles`, {
                            roleCode,
                            organisationId: roleScopeChosen,
                            ...givenReason(roleReason),
                          }),
                        "The officer already holds that role there.",
                      );
                      if (done) {
                        setRoleCode("");
                        setRoleReason("");
                      }
                    }}
                  >
                    Give role
                  </Button>
                </div>
              </div>
            ) : null}
          </Section>
        </TabsContent>

        <TabsContent value="permissions" className="grid gap-6 outline-none">
          <Section
            title="Single permissions"
            description="A permission granted to this officer alone, beyond their roles, or revoked from them whatever their roles give. A revocation always wins."
          >
            <div className="grid gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-faint-foreground">
                Granted
              </p>
              <Entries empty="None granted.">
                {officer.grants.map((grant) => (
                  <ScopedEntry
                    key={grant.id}
                    entry={grant}
                    removeLabel="Withdraw"
                    disabled={busy}
                    onRemove={
                      canGrant && !isSelf
                        ? () =>
                            setConfirming({
                              kind: "GRANT",
                              id: grant.id,
                              what: `${describe(grant.permission)} in ${grant.organisation.name}`,
                            })
                        : null
                    }
                  />
                ))}
              </Entries>
            </div>
            <div className="grid gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-faint-foreground">
                Revoked
              </p>
              <Entries empty="None revoked.">
                {officer.revocations.map((revocation) => (
                  <ScopedEntry
                    key={revocation.id}
                    entry={revocation}
                    removeLabel="Lift"
                    disabled={busy}
                    onRemove={
                      canRevoke && !isSelf
                        ? () =>
                            setConfirming({
                              kind: "REVOCATION",
                              id: revocation.id,
                              what: `${describe(revocation.permission)} in ${revocation.organisation.name}`,
                            })
                        : null
                    }
                  />
                ))}
              </Entries>
            </div>

            {(canGrant || canRevoke) && !isSelf ? (
              <div className="grid gap-4 border-t border-line pt-4">
                <PermissionChecklist
                  idPrefix="permission"
                  entries={PERMISSIONS}
                  value={chosenPermissions}
                  onChange={setChosenPermissions}
                  legend="Permissions"
                  required
                  filterable
                  hint="Tick as many as are needed. Each is granted, or revoked, in the part of the Union below."
                  note={(code) =>
                    placeNote(
                      code,
                      officer.grants,
                      officer.revocations,
                      permissionScopeChosen,
                    )
                  }
                />
                <OrganisationPicker
                  id="permissionScope"
                  value={permissionScopeChosen}
                  onChange={setPermissionScope}
                />
                <Reason
                  id="permissionReason"
                  value={permissionReason}
                  onChange={setPermissionReason}
                />
                <div className="flex flex-wrap gap-3">
                  {(
                    [
                      ["grants", "Grant", canGrant, "primary", officer.grants],
                      [
                        "revocations",
                        "Revoke",
                        canRevoke,
                        "danger",
                        officer.revocations,
                      ],
                    ] as const
                  ).map(([path, label, allowed, variant, inPlace]) => {
                    if (!allowed) return null;
                    // Only what is not already in place there is sent, so
                    // one already granted (or revoked) does not refuse all.
                    const sending = notInPlace(
                      chosenPermissions,
                      inPlace,
                      permissionScopeChosen,
                    );
                    return (
                      <Button
                        key={path}
                        type="button"
                        variant={variant}
                        disabled={
                          busy || sending.length === 0 || !permissionScopeChosen
                        }
                        onClick={async () => {
                          const done = await act(
                            () =>
                              api.post(`${base}/${path}`, {
                                permissions: sending,
                                organisationId: permissionScopeChosen,
                                ...givenReason(permissionReason),
                              }),
                            "That is already in place there.",
                          );
                          if (done) {
                            setChosenPermissions([]);
                            setPermissionReason("");
                          }
                        }}
                      >
                        {sending.length > 1
                          ? `${label} ${sending.length}`
                          : label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </Section>
        </TabsContent>

        {canManage && !isSelf ? (
          <TabsContent value="account" className="grid gap-6 outline-none">
            <Section
              title="Account"
              description="Each of these asks for a reason, which is recorded in the audit trail."
            >
              <DetailList>
                <Detail
                  label="Password"
                  value={
                    officer.mustChangePassword
                      ? "On a temporary password"
                      : "Chosen by the officer"
                  }
                />
                <Detail
                  label="Second factor"
                  value={officer.secondFactorEnrolled ? "Set up" : "Not set up"}
                />
              </DetailList>
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setConfirming({ kind: "PASSWORD" })}
                >
                  Issue a temporary password
                </Button>
                {officer.secondFactorEnrolled ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setConfirming({ kind: "MFA" })}
                  >
                    Remove second factor
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant={officer.isActive ? "danger" : "primary"}
                  onClick={() => setConfirming({ kind: "STATUS" })}
                >
                  {officer.isActive ? "Deactivate" : "Reactivate"}
                </Button>
              </div>
              <p className="text-xs text-faint-foreground">
                Deactivating signs the officer out at once and keeps the account
                and its history. Removing the second factor is for a lost phone:
                the officer sets it up again.
              </p>
            </Section>
          </TabsContent>
        ) : null}
      </Tabs>

      {confirming ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setConfirming(null);
            }
          }}
          title={asked(confirming).title}
          description={<p>{asked(confirming).description}</p>}
          confirmLabel={asked(confirming).confirmLabel}
          tone={asked(confirming).tone}
          reason={{}}
          onConfirm={(reason) => confirmed(confirming, reason)}
        />
      ) : null}
    </div>
  );
}
