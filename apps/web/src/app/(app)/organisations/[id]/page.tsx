"use client";

import {
  ABUSE_SIGNAL_LABELS,
  APPLICANT_CONFIRMATION_LABELS,
  type ApiClientDetail,
  type DisclosureProfileSummary,
  type IssuedApiToken,
  type IssuedPortalPassword,
  type RateLimitProfileSummary,
} from "@nurtw/contracts";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import useSWR from "swr";

import {
  OneTimeToken,
  ProfileFields,
  ScopePicker,
  explained,
  moment,
  scopeDescription,
  shortDay,
} from "@/components/api-access";
import { TemporaryPassword } from "@/components/officers";
import { PortalUsageSection } from "@/components/portal-usage";
import {
  Button,
  ErrorNotice,
  Field,
  Section,
  Select,
  StatusChip,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextArea,
  TextInput,
} from "@/components/ui";
import { ApiError, api, fetcher } from "@/lib/api";
import { useSession } from "@/lib/session";

/**
 * One outside organisation: its record, its access, and its tokens (PRD
 * §12.1, item 11), in tabs since item 33.
 *
 * The controls offered follow the organisation's status and the officer's
 * permissions. That is a courtesy: the API refuses regardless. The notices
 * about its standing stay above the tabs, whichever is open.
 */

const OVERLAPS = [
  { value: "ONE_DAY", label: "Keep the old token working for 24 hours" },
  { value: "SEVEN_DAYS", label: "Keep the old token working for 7 days" },
  { value: "ONE_HOUR", label: "Keep the old token working for 1 hour" },
  { value: "NONE", label: "Stop the old token at once" },
] as const;

const TOKEN_STATES: Record<string, string> = {
  CURRENT: "In use",
  RETIRING: "Being replaced",
  REPLACED: "Replaced",
  EXPIRED: "Expired",
  REVOKED: "Revoked",
};

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-faint-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

function Missing({ children = "Not recorded" }: { children?: ReactNode }) {
  return <span className="italic text-faint-foreground">{children}</span>;
}

/** Today in Lagos, as `YYYY-MM-DD`: an agreement cannot be signed later. */
function lagosToday(): string {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

function ProfileChoice({
  id,
  profiles,
  value,
  onChange,
}: {
  id: string;
  profiles: DisclosureProfileSummary[];
  value: string;
  onChange: (next: string) => void;
}) {
  const chosen = profiles.find((profile) => profile.id === value);
  return (
    <div className="grid gap-2">
      <Field
        label="Disclosure profile"
        htmlFor={id}
        required
        hint="What a verification response may tell this organisation beyond the match itself."
      >
        <Select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Select a profile</option>
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.label}
            </option>
          ))}
        </Select>
      </Field>
      {chosen ? (
        <div className="rounded-md bg-surface-muted px-3 py-2">
          {chosen.description ? (
            <p className="mb-2 text-xs text-muted-foreground">
              {chosen.description}
            </p>
          ) : null}
          <ProfileFields fields={chosen.fields} />
        </div>
      ) : null}
    </div>
  );
}

export default function ApiClientPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { holds } = useSession();
  const canManage = holds("api_client.manage");
  const canTokens = holds("api_token.manage");

  const { data, error, isLoading, mutate } = useSWR<{
    client: ApiClientDetail;
  }>(`/api-clients/${params.id}`, fetcher);
  const client = data?.client ?? null;
  const loadError = error instanceof ApiError ? error : null;

  // The profiles on offer, served under `api_client.read`: what the forms
  // choose from, and how the organisation's own profile is described.
  const { data: profileList } = useSWR<{
    profiles: DisclosureProfileSummary[];
  }>(client ? "/api-clients/profiles" : null, fetcher);
  const profiles = profileList?.profiles ?? [];
  // The limit profiles on offer, also served under `api_client.read`.
  const { data: limitList } = useSWR<{
    profiles: RateLimitProfileSummary[];
  }>(client ? "/rate-limits/profiles" : null, fetcher);
  const limitProfiles = limitList?.profiles ?? [];
  const heldProfile = profiles.find(
    (profile) => profile.id === client?.disclosureProfile?.id,
  );

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<ApiError | null>(null);
  const [issued, setIssued] = useState<string | null>(null);

  // Approval and access.
  const [profileId, setProfileId] = useState("");
  const [scopes, setScopes] = useState<string[]>([]);
  const [agreementReference, setAgreementReference] = useState("");
  const [agreementDate, setAgreementDate] = useState("");
  // How a self-applicant was confirmed, and its portal account (item 29).
  const [confirmVia, setConfirmVia] = useState("");
  const [confirmNote, setConfirmNote] = useState("");
  const [portalEmail, setPortalEmail] = useState("");
  const [portalName, setPortalName] = useState("");
  const [portalReason, setPortalReason] = useState("");
  const [portalPassword, setPortalPassword] = useState<string | null>(null);
  const [accessReason, setAccessReason] = useState("");
  // Status, tokens, and the record.
  const [statusReason, setStatusReason] = useState("");
  const [overlap, setOverlap] = useState<string>("ONE_DAY");
  const [revokeTokenId, setRevokeTokenId] = useState("");
  const [revokeReason, setRevokeReason] = useState("");
  const [editing, setEditing] = useState(false);
  const [organisationName, setOrganisationName] = useState("");
  const [businessPurpose, setBusinessPurpose] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [addresses, setAddresses] = useState("");
  const [editReference, setEditReference] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editReason, setEditReason] = useState("");
  // Limits and the pause (item 13).
  const [limitProfile, setLimitProfile] = useState("");
  const [ownQuota, setOwnQuota] = useState("");
  const [limitsReason, setLimitsReason] = useState("");
  const [liftReason, setLiftReason] = useState("");
  const [syncedFor, setSyncedFor] = useState<string | null>(null);

  // The forms start from the record as loaded, and start again whenever it
  // is reloaded after a change. Adjusted during render, as the vehicle page
  // does, rather than in an effect that would flash the old values.
  const version = client
    ? `${client.id}:${client.status}:${client.disclosureProfile?.id ?? ""}:${client.scopes.join()}:${client.organisationName}:${client.allowedIpRanges.join()}:${client.agreementReference ?? ""}:${client.limits.profile.code}:${client.limits.dailyQuotaOverride ?? ""}:${client.pausedUntil ?? ""}`
    : null;
  if (client && version !== syncedFor) {
    setSyncedFor(version);
    setProfileId(client.disclosureProfile?.id ?? "");
    setScopes(client.scopes);
    setAccessReason("");
    setStatusReason("");
    setOrganisationName(client.organisationName);
    setBusinessPurpose(client.businessPurpose);
    setContactName(client.technicalContact.name);
    setContactEmail(client.technicalContact.email);
    setContactPhone(client.technicalContact.phone ?? "");
    setAddresses(client.allowedIpRanges.join("\n"));
    setEditReference(client.agreementReference ?? "");
    setEditDate(client.agreementDate ?? "");
    setEditReason("");
    setLimitProfile(client.limits.profile.code);
    setOwnQuota(client.limits.dailyQuotaOverride?.toString() ?? "");
    setLimitsReason("");
    setLiftReason("");
  }

  async function act(action: () => Promise<unknown>, conflict: string) {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      await mutate();
      return true;
    } catch (caught) {
      setActionError(explained(caught, conflict));
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) {
    return <p className="text-sm text-faint-foreground">Loading…</p>;
  }

  if (!client) {
    return (
      <div className="grid gap-4">
        <ErrorNotice
          message={
            loadError?.status === 404
              ? "No such organisation."
              : (loadError?.message ?? "The organisation could not be loaded.")
          }
          requestId={loadError?.requestId}
        />
        <Link
          href="/organisations"
          className="text-sm underline underline-offset-2"
        >
          Back to organisations
        </Link>
      </div>
    );
  }

  const isPending = client.status === "PENDING";
  const isSuspended = client.status === "SUSPENDED";
  const isRevoked = client.status === "REVOKED";
  // Stored as active, whether or not its token has run out.
  const isApproved = client.status === "ACTIVE" || client.status === "EXPIRED";
  const current = client.currentToken;
  const revocable = client.tokens.filter(
    (token) => token.state === "CURRENT" || token.state === "RETIRING",
  );
  const rangeList = addresses
    .split(/[\n,]/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  // Item 33 — the open tab is in the address, so a link can lead to one. A
  // tab an officer cannot use is not offered, and asking for it opens Overview.
  const manageable = canManage && !isRevoked;
  const tabs = [
    { value: "overview", label: "Overview" },
    ...(manageable
      ? [{ value: "access", label: isPending ? "Approve" : "Access" }]
      : []),
    { value: "tokens", label: "Tokens" },
    { value: "usage", label: "Usage" },
    { value: "limits", label: "Limits" },
    ...(manageable
      ? [
          { value: "portal", label: "Portal account" },
          { value: "settings", label: "Settings" },
        ]
      : []),
  ];
  const asked = searchParams.get("tab") ?? "overview";
  const tab = tabs.some((entry) => entry.value === asked) ? asked : "overview";
  const setTab = (next: string) =>
    router.replace(
      `/organisations/${client.id}${next === "overview" ? "" : `?tab=${next}`}`,
      { scroll: false },
    );

  return (
    <div className="grid max-w-4xl gap-6">
      <div>
        <Link
          href="/organisations"
          className="text-sm text-faint-foreground underline-offset-2 hover:underline"
        >
          ← Organisations
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {client.organisationName}
          </h1>
          <StatusChip status={client.status} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {client.invitation
            ? `Invited ${shortDay(client.invitation.invitedAt)}${
                client.invitation.invitedBy
                  ? ` by ${client.invitation.invitedBy}`
                  : ""
              }, applied ${shortDay(client.createdAt)}.`
            : client.selfRegistered
              ? `Applied ${shortDay(client.createdAt)} through the portal.`
              : `Registered ${shortDay(client.createdAt)}${
                  client.registeredBy
                    ? ` by ${client.registeredBy.fullName}`
                    : ""
                }.`}
        </p>
      </div>

      {issued ? (
        <OneTimeToken
          token={issued}
          organisationName={client.organisationName}
          onDone={() => setIssued(null)}
        />
      ) : null}

      {actionError ? (
        <ErrorNotice
          message={actionError.message}
          requestId={actionError.requestId}
        />
      ) : null}

      {portalPassword ? (
        <TemporaryPassword
          password={portalPassword}
          officerName={`${client.organisationName}'s contact`}
          onDone={() => setPortalPassword(null)}
        />
      ) : null}

      {isPending ? (
        <Notice title="Pending approval">
          This organisation can do nothing until it is approved with a
          disclosure profile, its scopes, and a data-sharing agreement.
          {canManage && tab !== "access" ? (
            <button
              type="button"
              onClick={() => setTab("access")}
              className="mt-2 block font-semibold underline underline-offset-2"
            >
              Review and approve
            </button>
          ) : null}
        </Notice>
      ) : null}
      {isPending && client.selfRegistered ? (
        <Notice
          title={
            client.invitation
              ? "It applied through an invitation"
              : "It applied for itself, through the portal"
          }
        >
          {client.invitation
            ? "An invitation confirms nobody: whoever held the link could have applied. "
            : ""}
          Nobody at the Union has yet confirmed who sent this. Telephone{" "}
          {client.technicalContact.name}
          {client.technicalContact.phone
            ? ` on ${client.technicalContact.phone}`
            : ""}
          , or write to the organisation, before approving it.
          {client.applicationExpiresAt
            ? ` The application lapses on ${shortDay(client.applicationExpiresAt)} if it is not approved.`
            : ""}
        </Notice>
      ) : null}
      {isSuspended ? (
        <Notice title="Suspended" tone="deny">
          Its tokens are refused until it is reinstated. They are kept, so
          reinstating it restores access without a new token.
          {client.statusReason ? ` Reason given: ${client.statusReason}` : ""}
        </Notice>
      ) : null}
      {isRevoked ? (
        <Notice title="Access withdrawn" tone="deny">
          Every token it held was revoked, and this record is closed. An
          organisation whose access was withdrawn is registered afresh.
          {client.statusReason ? ` Reason given: ${client.statusReason}` : ""}
        </Notice>
      ) : null}
      {client.pause?.active ? (
        <Notice title="Paused by abuse detection" tone="deny">
          {ABUSE_SIGNAL_LABELS[client.pause.signal].description} Its requests
          are refused until {moment(client.pause.pausedUntil)}. Lift the pause
          below if the pattern has an innocent cause, or suspend the
          organisation to keep it out.
        </Notice>
      ) : null}
      {client.status === "EXPIRED" ? (
        <Notice title="Token expired">
          Its token has run out and nothing has replaced it, so its requests are
          refused. Issue a new token to restore access.
        </Notice>
      ) : null}
      {current?.expiringSoon ? (
        <Notice title="Token expires soon">
          The token in use expires on {shortDay(current.expiresAt)}. Replace it
          below and pass the new one to {client.technicalContact.name} (
          {client.technicalContact.email}) before then.
        </Notice>
      ) : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {tabs.map((entry) => (
            <TabsTrigger key={entry.value} value={entry.value}>
              {entry.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-6 grid gap-6">
          <Section title="Organisation">
            <dl className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Detail label="Purpose">{client.businessPurpose}</Detail>
              </div>
              <Detail label="Technical contact">
                {client.technicalContact.name}
                <span className="block text-muted-foreground">
                  {client.technicalContact.email}
                </span>
                {client.technicalContact.phone ? (
                  <span className="block text-muted-foreground">
                    {client.technicalContact.phone}
                  </span>
                ) : null}
              </Detail>
              <Detail label="Allowed addresses">
                {client.allowedIpRanges.length === 0 ? (
                  <Missing>Any address</Missing>
                ) : (
                  <span className="font-mono text-xs">
                    {client.allowedIpRanges.map((range) => (
                      <span key={range} className="block">
                        {range}
                      </span>
                    ))}
                  </span>
                )}
              </Detail>
              <Detail label="Data-sharing agreement">
                {client.agreementReference ? (
                  <>
                    {client.agreementReference}
                    <span className="block text-muted-foreground">
                      Signed {shortDay(client.agreementDate)}
                    </span>
                  </>
                ) : (
                  <Missing />
                )}
              </Detail>
              <Detail label="Approved">
                {client.approvedAt ? (
                  <>
                    {shortDay(client.approvedAt)}
                    {client.approvedBy ? (
                      <span className="block text-muted-foreground">
                        by {client.approvedBy.fullName}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <Missing>Not yet</Missing>
                )}
              </Detail>
              <Detail label="Registered">
                {shortDay(client.createdAt)}
                {client.registeredBy ? (
                  <span className="block text-muted-foreground">
                    by {client.registeredBy.fullName}
                  </span>
                ) : null}
                {client.selfRegistered ? (
                  <span className="block text-muted-foreground">
                    by the organisation itself, through the portal
                  </span>
                ) : null}
              </Detail>
              {client.applicantConfirmation ? (
                <Detail label="Applicant confirmed">
                  {APPLICANT_CONFIRMATION_LABELS[
                    client.applicantConfirmation
                      .via as keyof typeof APPLICANT_CONFIRMATION_LABELS
                  ] ?? client.applicantConfirmation.via}
                  {client.applicantConfirmation.note ? (
                    <span className="block text-muted-foreground">
                      {client.applicantConfirmation.note}
                    </span>
                  ) : null}
                </Detail>
              ) : null}
            </dl>
          </Section>

          {!isPending ? (
            <Section title="Access">
              <dl className="grid gap-4">
                <Detail label="Disclosure profile">
                  {client.disclosureProfile ? (
                    <>
                      <span className="font-medium">
                        {client.disclosureProfile.label}
                      </span>
                      {heldProfile ? (
                        <span className="mt-1.5 block">
                          <ProfileFields fields={heldProfile.fields} />
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <Missing>None</Missing>
                  )}
                </Detail>
                <Detail label="Scopes">
                  {client.scopes.length === 0 ? (
                    <Missing>None</Missing>
                  ) : (
                    <ul className="grid gap-1">
                      {client.scopes.map((scope) => (
                        <li key={scope}>
                          {scopeDescription(scope)}{" "}
                          <span className="font-mono text-xs text-faint-foreground">
                            {scope}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Detail>
              </dl>
            </Section>
          ) : null}
        </TabsContent>

        <TabsContent value="access" className="mt-6 grid gap-6">
          {isPending && canManage ? (
            <Section
              title="Approve"
              description="Approval gives the organisation its profile and scopes. It issues no token: that is done below once it is approved."
            >
              <ProfileChoice
                id="approveProfile"
                profiles={profiles}
                value={profileId}
                onChange={setProfileId}
              />
              <ScopePicker
                idPrefix="approveScope"
                value={scopes}
                onChange={setScopes}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Agreement reference"
                  htmlFor="agreementReference"
                  required
                  hint="The data-sharing agreement the organisation signed. No organisation is approved without one."
                  error={actionError?.fieldError("agreementReference")}
                >
                  <TextInput
                    id="agreementReference"
                    value={agreementReference}
                    onChange={(event) =>
                      setAgreementReference(event.target.value)
                    }
                  />
                </Field>
                <Field
                  label="Date signed"
                  htmlFor="agreementDate"
                  required
                  error={actionError?.fieldError("agreementDate")}
                >
                  <TextInput
                    id="agreementDate"
                    type="date"
                    max={lagosToday()}
                    value={agreementDate}
                    onChange={(event) => setAgreementDate(event.target.value)}
                  />
                </Field>
              </div>
              {client.selfRegistered ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="How the applicant was confirmed"
                    htmlFor="confirmVia"
                    required
                    hint="It applied for itself. Confirm who it is before approving."
                    error={actionError?.fieldError("applicantConfirmation")}
                  >
                    <Select
                      id="confirmVia"
                      value={confirmVia}
                      onChange={(event) => setConfirmVia(event.target.value)}
                    >
                      <option value="">Not yet confirmed</option>
                      {Object.entries(APPLICANT_CONFIRMATION_LABELS).map(
                        ([code, label]) => (
                          <option key={code} value={code}>
                            {label}
                          </option>
                        ),
                      )}
                    </Select>
                  </Field>
                  <Field
                    label="Note"
                    htmlFor="confirmNote"
                    hint="Who was spoken to, or the letter's reference."
                  >
                    <TextInput
                      id="confirmNote"
                      value={confirmNote}
                      onChange={(event) => setConfirmNote(event.target.value)}
                      maxLength={500}
                    />
                  </Field>
                </div>
              ) : null}
              <div>
                <Button
                  type="button"
                  disabled={
                    busy ||
                    !profileId ||
                    scopes.length === 0 ||
                    agreementReference.trim().length < 2 ||
                    !agreementDate ||
                    (client.selfRegistered && !confirmVia)
                  }
                  onClick={() =>
                    void act(
                      () =>
                        api.post(`/api-clients/${client.id}/approve`, {
                          disclosureProfileId: profileId,
                          scopes,
                          agreementReference: agreementReference.trim(),
                          agreementDate,
                          ...(client.selfRegistered
                            ? {
                                applicantConfirmation: {
                                  via: confirmVia,
                                  ...(confirmNote.trim()
                                    ? { note: confirmNote.trim() }
                                    : {}),
                                },
                              }
                            : {}),
                        }),
                      "It could not be approved: it is no longer pending, its application has lapsed, or the profile chosen is no longer offered. The page now shows its current state.",
                    )
                  }
                >
                  Approve
                </Button>
              </div>
            </Section>
          ) : null}

          {(isApproved || isSuspended) && canManage ? (
            <Section
              title="Change access"
              description="Replaces the profile and the scopes. It applies to the organisation’s next request. A reason is required and recorded."
            >
              <ProfileChoice
                id="accessProfile"
                profiles={profiles}
                value={profileId}
                onChange={setProfileId}
              />
              <ScopePicker
                idPrefix="accessScope"
                value={scopes}
                onChange={setScopes}
              />
              <Field label="Reason" htmlFor="accessReason" required>
                <TextInput
                  id="accessReason"
                  value={accessReason}
                  onChange={(event) => setAccessReason(event.target.value)}
                  maxLength={1000}
                />
              </Field>
              <div>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={
                    busy ||
                    !profileId ||
                    scopes.length === 0 ||
                    accessReason.trim().length < 4
                  }
                  onClick={() =>
                    void act(
                      () =>
                        api.put(`/api-clients/${client.id}/access`, {
                          disclosureProfileId: profileId,
                          scopes,
                          reason: accessReason.trim(),
                        }),
                      "Access could not be changed: the organisation’s status has changed, or the profile chosen is no longer offered.",
                    )
                  }
                >
                  Save access
                </Button>
              </div>
            </Section>
          ) : null}
        </TabsContent>

        <TabsContent value="tokens" className="mt-6 grid gap-6">
          {!isPending ? (
            <Section
              title="Tokens"
              description="A token is shown once, when it is issued or replaced. The prefix identifies it here and in the audit trail; it cannot be used to make a request."
            >
              {client.tokens.length === 0 ? (
                <p className="text-sm italic text-faint-foreground">
                  No token has been issued.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[36rem] text-sm">
                    <thead className="border-b border-line text-left">
                      <tr>
                        <th className="py-2 pr-3 font-semibold">Token</th>
                        <th className="py-2 pr-3 font-semibold">State</th>
                        <th className="py-2 pr-3 font-semibold">Issued</th>
                        <th className="py-2 pr-3 font-semibold">Expires</th>
                        <th className="py-2 font-semibold">Last used</th>
                      </tr>
                    </thead>
                    <tbody>
                      {client.tokens.map((token) => (
                        <tr
                          key={token.id}
                          className="border-b border-line last:border-0"
                        >
                          <td className="py-2 pr-3 font-mono text-xs">
                            {token.prefix}…
                          </td>
                          <td className="py-2 pr-3">
                            <StatusChip status={token.state} />
                            <span className="sr-only">
                              {TOKEN_STATES[token.state]}
                            </span>
                            {token.state === "RETIRING" && token.retiresAt ? (
                              <span className="block text-xs text-faint-foreground">
                                stops {moment(token.retiresAt)}
                              </span>
                            ) : null}
                          </td>
                          <td className="py-2 pr-3 text-muted-foreground">
                            {shortDay(token.createdAt)}
                          </td>
                          <td className="py-2 pr-3 text-muted-foreground">
                            {shortDay(token.expiresAt)}
                            {token.expiringSoon ? (
                              <span className="block text-xs font-medium">
                                Replace soon
                              </span>
                            ) : null}
                          </td>
                          <td className="py-2 text-muted-foreground">
                            {token.lastUsedAt ? (
                              moment(token.lastUsedAt)
                            ) : (
                              <Missing>Never</Missing>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {canTokens && isApproved && !current ? (
                <div className="border-t border-line pt-4">
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        const response = await api.post<IssuedApiToken>(
                          `/api-clients/${client.id}/tokens`,
                        );
                        setIssued(response.token);
                      }, "A token could not be issued: the organisation already has one in use, or is no longer active. The page now shows its current state.")
                    }
                  >
                    Issue a token
                  </Button>
                </div>
              ) : null}

              {canTokens && isApproved && current ? (
                <div className="grid gap-3 border-t border-line pt-4">
                  <Field
                    label="Replace the token in use"
                    htmlFor="overlap"
                    hint="A new token is issued for a full term. Give the organisation time to install it; a token that has leaked should be revoked instead."
                  >
                    <Select
                      id="overlap"
                      value={overlap}
                      onChange={(event) => setOverlap(event.target.value)}
                    >
                      {OVERLAPS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <div>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          const response = await api.post<IssuedApiToken>(
                            `/api-clients/${client.id}/tokens/${current.id}/rotate`,
                            { overlap },
                          );
                          setIssued(response.token);
                        }, "The token could not be replaced: it is no longer the one in use, or the organisation is no longer active. The page now shows its current state.")
                      }
                    >
                      Replace token
                    </Button>
                  </div>
                </div>
              ) : null}

              {canTokens && revocable.length > 0 ? (
                <div className="grid gap-3 border-t border-line pt-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Revoke a token"
                      htmlFor="revokeToken"
                      hint="Takes effect on the next request."
                    >
                      <Select
                        id="revokeToken"
                        value={revokeTokenId}
                        onChange={(event) =>
                          setRevokeTokenId(event.target.value)
                        }
                      >
                        <option value="">Select a token</option>
                        {revocable.map((token) => (
                          <option key={token.id} value={token.id}>
                            {token.prefix}… (
                            {TOKEN_STATES[token.state]?.toLowerCase()})
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Reason" htmlFor="revokeReason" required>
                      <TextInput
                        id="revokeReason"
                        value={revokeReason}
                        onChange={(event) =>
                          setRevokeReason(event.target.value)
                        }
                        maxLength={1000}
                      />
                    </Field>
                  </div>
                  <div>
                    <Button
                      type="button"
                      variant="danger"
                      disabled={
                        busy || !revokeTokenId || revokeReason.trim().length < 4
                      }
                      onClick={async () => {
                        const done = await act(
                          () =>
                            api.post(
                              `/api-clients/${client.id}/tokens/${revokeTokenId}/revoke`,
                              { reason: revokeReason.trim() },
                            ),
                          "That token was already revoked. The page now shows its current state.",
                        );
                        if (done) {
                          setRevokeTokenId("");
                          setRevokeReason("");
                        }
                      }}
                    >
                      Revoke token
                    </Button>
                  </div>
                </div>
              ) : null}
            </Section>
          ) : null}

          {isPending ? (
            <p className="text-sm text-muted-foreground">
              A token is issued once the organisation is approved.
            </p>
          ) : null}
        </TabsContent>

        <TabsContent value="usage" className="mt-6 grid gap-6">
          <PortalUsageSection
            limits={client.limits}
            source={`/api-clients/${client.id}/usage`}
            description="This organisation's requests to the API, counted by day in Lagos time. It is what the organisation sees in its own portal, and no more: no plate, sticker, or membership number it looked up is kept or shown."
          />
        </TabsContent>

        <TabsContent value="limits" className="mt-6 grid gap-6">
          <Section
            title="Limits"
            description="How much the organisation may ask (PRD §14). Over a limit, it is told to wait and try again."
          >
            <dl className="grid gap-4 sm:grid-cols-3">
              <Detail label="Limit profile">
                {client.limits.profile.label}
              </Detail>
              <Detail label="Daily quota">
                {client.limits.dailyQuota.toLocaleString("en-GB")}
                {client.limits.dailyQuotaOverride !== null ? (
                  <span className="block text-muted-foreground">
                    Its own, not the profile’s
                  </span>
                ) : null}
              </Detail>
              <Detail label="Used today">
                {client.limits.usedToday.toLocaleString("en-GB")}
                <span className="block text-muted-foreground">
                  Since midnight in Lagos
                </span>
              </Detail>
              {client.pause && !client.pause.active ? (
                <div className="sm:col-span-3">
                  <Detail label="Last paused">
                    {moment(client.pause.pausedAt)} —{" "}
                    {ABUSE_SIGNAL_LABELS[
                      client.pause.signal
                    ].label.toLowerCase()}
                    , until {moment(client.pause.pausedUntil)}
                  </Detail>
                </div>
              ) : null}
            </dl>

            {client.pause?.active && canManage ? (
              <div className="grid gap-3 border-t border-line pt-4">
                <Field
                  label="Reason for lifting the pause"
                  htmlFor="liftReason"
                  required
                  hint="Recorded in the audit trail. The organisation’s next request is answered."
                >
                  <TextInput
                    id="liftReason"
                    value={liftReason}
                    onChange={(event) => setLiftReason(event.target.value)}
                    maxLength={1000}
                  />
                </Field>
                <div>
                  <Button
                    type="button"
                    disabled={busy || liftReason.trim().length < 4}
                    onClick={() =>
                      void act(
                        () =>
                          api.post(`/api-clients/${client.id}/pause/lift`, {
                            reason: liftReason.trim(),
                          }),
                        "The pause had already ended. The page now shows the organisation’s current state.",
                      )
                    }
                  >
                    Lift the pause
                  </Button>
                </div>
              </div>
            ) : null}

            {canManage && !isRevoked ? (
              <div className="grid gap-3 border-t border-line pt-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Limit profile" htmlFor="limitProfile" required>
                    <Select
                      id="limitProfile"
                      value={limitProfile}
                      onChange={(event) => setLimitProfile(event.target.value)}
                    >
                      {limitProfiles.map((profile) => (
                        <option key={profile.code} value={profile.code}>
                          {profile.label} — {profile.verificationPerMinute} a
                          minute, {profile.dailyQuota.toLocaleString("en-GB")} a
                          day
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field
                    label="Its own daily quota"
                    htmlFor="ownQuota"
                    hint="Leave blank to use the profile’s."
                    error={actionError?.fieldError("dailyQuota")}
                  >
                    <TextInput
                      id="ownQuota"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      value={ownQuota}
                      onChange={(event) => setOwnQuota(event.target.value)}
                    />
                  </Field>
                </div>
                <Field label="Reason" htmlFor="limitsReason" required>
                  <TextInput
                    id="limitsReason"
                    value={limitsReason}
                    onChange={(event) => setLimitsReason(event.target.value)}
                    maxLength={1000}
                  />
                </Field>
                <div>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={
                      busy || !limitProfile || limitsReason.trim().length < 4
                    }
                    onClick={() =>
                      void act(
                        () =>
                          api.put(`/api-clients/${client.id}/limits`, {
                            rateLimitProfile: limitProfile,
                            dailyQuota:
                              ownQuota.trim() === "" ? null : Number(ownQuota),
                            reason: limitsReason.trim(),
                          }),
                        "The limits could not be changed: the organisation’s access has been withdrawn.",
                      )
                    }
                  >
                    Save limits
                  </Button>
                </div>
              </div>
            ) : null}
          </Section>
        </TabsContent>

        <TabsContent value="portal" className="mt-6 grid gap-6">
          {canManage && !isRevoked ? (
            <Section
              title="Portal account"
              description="The organisation's own sign-in to its portal, where it sees its usage and manages its own tokens. It holds no officer permission and reaches nothing else."
            >
              {client.portalAccount ? (
                <>
                  <dl className="grid gap-4 sm:grid-cols-2">
                    <Detail label="Signs in as">
                      {client.portalAccount.fullName}
                      <span className="block text-muted-foreground">
                        {client.portalAccount.email}
                      </span>
                    </Detail>
                    <Detail label="Last signed in">
                      {client.portalAccount.lastLoginAt ? (
                        moment(client.portalAccount.lastLoginAt)
                      ) : (
                        <Missing>Never</Missing>
                      )}
                      {client.portalAccount.mustChangePassword ? (
                        <span className="block text-muted-foreground">
                          On a temporary password
                        </span>
                      ) : null}
                      {client.portalAccount.locked ? (
                        <span className="block text-muted-foreground">
                          Locked for a time after failed sign-ins
                        </span>
                      ) : null}
                    </Detail>
                  </dl>
                  <Field
                    label="Reason for a new temporary password"
                    htmlFor="portalReason"
                    hint="For a forgotten password or a locked account. It signs the account out everywhere."
                  >
                    <TextInput
                      id="portalReason"
                      value={portalReason}
                      onChange={(event) => setPortalReason(event.target.value)}
                      maxLength={1000}
                    />
                  </Field>
                  <div>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy || portalReason.trim().length < 4}
                      onClick={() =>
                        void act(async () => {
                          const reset = await api.post<IssuedPortalPassword>(
                            `/api-clients/${client.id}/portal-account/reset-password`,
                            { reason: portalReason.trim() },
                          );
                          setPortalPassword(reset.temporaryPassword);
                          setPortalReason("");
                        }, "The password could not be reset. The page now shows the account's current state.")
                      }
                    >
                      Reset the portal password
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    This organisation has no portal account. Give it one, and
                    pass the temporary password to its contact.
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Contact's name"
                      htmlFor="portalName"
                      required
                      error={actionError?.fieldError("fullName")}
                    >
                      <TextInput
                        id="portalName"
                        value={portalName}
                        onChange={(event) => setPortalName(event.target.value)}
                      />
                    </Field>
                    <Field
                      label="Email they will sign in with"
                      htmlFor="portalEmail"
                      required
                      error={actionError?.fieldError("email")}
                    >
                      <TextInput
                        id="portalEmail"
                        type="email"
                        autoComplete="off"
                        value={portalEmail}
                        onChange={(event) => setPortalEmail(event.target.value)}
                      />
                    </Field>
                  </div>
                  <div>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={
                        busy ||
                        portalName.trim().length < 2 ||
                        !portalEmail.includes("@")
                      }
                      onClick={() =>
                        void act(async () => {
                          const created = await api.post<IssuedPortalPassword>(
                            `/api-clients/${client.id}/portal-account`,
                            {
                              email: portalEmail.trim(),
                              fullName: portalName.trim(),
                            },
                          );
                          setPortalPassword(created.temporaryPassword);
                          setPortalEmail("");
                          setPortalName("");
                        }, "The account could not be made: that address already signs in to another organisation's portal, or this one has just been given an account.")
                      }
                    >
                      Give it a portal account
                    </Button>
                  </div>
                </>
              )}
            </Section>
          ) : null}
        </TabsContent>

        <TabsContent value="settings" className="mt-6 grid gap-6">
          {canManage && !isRevoked ? (
            <Section
              title="Organisation details"
              description="Corrects the record. It cannot change what the organisation may do. A reason is required and recorded."
            >
              {!editing ? (
                <div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setEditing(true)}
                  >
                    Edit details
                  </Button>
                </div>
              ) : (
                <>
                  <Field
                    label="Organisation"
                    htmlFor="editName"
                    required
                    error={actionError?.fieldError("organisationName")}
                  >
                    <TextInput
                      id="editName"
                      value={organisationName}
                      onChange={(event) =>
                        setOrganisationName(event.target.value)
                      }
                      maxLength={200}
                    />
                  </Field>
                  <Field
                    label="Purpose"
                    htmlFor="editPurpose"
                    required
                    error={actionError?.fieldError("businessPurpose")}
                  >
                    <TextArea
                      id="editPurpose"
                      value={businessPurpose}
                      onChange={(event) =>
                        setBusinessPurpose(event.target.value)
                      }
                      maxLength={2000}
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field
                      label="Technical contact"
                      htmlFor="editContactName"
                      required
                    >
                      <TextInput
                        id="editContactName"
                        value={contactName}
                        onChange={(event) => setContactName(event.target.value)}
                      />
                    </Field>
                    <Field
                      label="Contact email"
                      htmlFor="editContactEmail"
                      required
                      error={actionError?.fieldError("technicalContact.email")}
                    >
                      <TextInput
                        id="editContactEmail"
                        type="email"
                        value={contactEmail}
                        onChange={(event) =>
                          setContactEmail(event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Contact phone" htmlFor="editContactPhone">
                      <TextInput
                        id="editContactPhone"
                        inputMode="tel"
                        value={contactPhone}
                        onChange={(event) =>
                          setContactPhone(event.target.value)
                        }
                      />
                    </Field>
                  </div>
                  <Field
                    label="Allowed addresses"
                    htmlFor="editRanges"
                    hint="One address or range per line. Leave blank to allow any address. Applies to the next request."
                    error={
                      actionError?.details.find((detail) =>
                        detail.field.startsWith("allowedIpRanges"),
                      )?.message
                    }
                  >
                    <TextArea
                      id="editRanges"
                      value={addresses}
                      onChange={(event) => setAddresses(event.target.value)}
                      className="font-mono"
                    />
                  </Field>
                  {!isPending ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field
                        label="Agreement reference"
                        htmlFor="editReference"
                      >
                        <TextInput
                          id="editReference"
                          value={editReference}
                          onChange={(event) =>
                            setEditReference(event.target.value)
                          }
                        />
                      </Field>
                      <Field
                        label="Date signed"
                        htmlFor="editDate"
                        error={actionError?.fieldError("agreementDate")}
                      >
                        <TextInput
                          id="editDate"
                          type="date"
                          max={lagosToday()}
                          value={editDate}
                          onChange={(event) => setEditDate(event.target.value)}
                        />
                      </Field>
                    </div>
                  ) : null}
                  <Field label="Reason" htmlFor="editReason" required>
                    <TextInput
                      id="editReason"
                      value={editReason}
                      onChange={(event) => setEditReason(event.target.value)}
                      maxLength={1000}
                    />
                  </Field>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="button"
                      disabled={busy || editReason.trim().length < 4}
                      onClick={async () => {
                        const contactChanged =
                          contactName !== client.technicalContact.name ||
                          contactEmail !== client.technicalContact.email ||
                          contactPhone !==
                            (client.technicalContact.phone ?? "");
                        const done = await act(
                          () =>
                            api.patch(`/api-clients/${client.id}`, {
                              ...(organisationName !== client.organisationName
                                ? { organisationName }
                                : {}),
                              ...(businessPurpose !== client.businessPurpose
                                ? { businessPurpose }
                                : {}),
                              ...(contactChanged
                                ? {
                                    technicalContact: {
                                      name: contactName,
                                      email: contactEmail.trim(),
                                      ...(contactPhone.trim()
                                        ? { phone: contactPhone }
                                        : {}),
                                    },
                                  }
                                : {}),
                              ...(rangeList.join() !==
                              client.allowedIpRanges.join()
                                ? { allowedIpRanges: rangeList }
                                : {}),
                              ...(!isPending &&
                              editReference !==
                                (client.agreementReference ?? "")
                                ? { agreementReference: editReference }
                                : {}),
                              ...(!isPending &&
                              editDate !== (client.agreementDate ?? "")
                                ? { agreementDate: editDate }
                                : {}),
                              reason: editReason.trim(),
                            }),
                          "The record could not be changed: the organisation’s access has been withdrawn.",
                        );
                        if (done) {
                          setEditing(false);
                        }
                      }}
                    >
                      Save details
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => setEditing(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              )}
            </Section>
          ) : null}

          {canManage && !isRevoked ? (
            <Section
              title={isPending ? "Refuse" : "Status"}
              description={
                isPending
                  ? "Refusing closes the registration for good. A reason is required and recorded."
                  : "Suspending refuses its tokens until it is reinstated. Revoking withdraws every token and closes the record for good. A reason is required and recorded."
              }
            >
              <Field label="Reason" htmlFor="statusReason" required>
                <TextArea
                  id="statusReason"
                  value={statusReason}
                  onChange={(event) => setStatusReason(event.target.value)}
                />
              </Field>
              <div className="flex flex-wrap gap-3">
                {isApproved ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy || statusReason.trim().length < 4}
                    onClick={() =>
                      void act(
                        () =>
                          api.post(`/api-clients/${client.id}/status`, {
                            status: "SUSPENDED",
                            reason: statusReason.trim(),
                          }),
                        "Its status has changed since the page loaded. The page now shows it.",
                      )
                    }
                  >
                    Suspend
                  </Button>
                ) : null}
                {isSuspended ? (
                  <Button
                    type="button"
                    disabled={busy || statusReason.trim().length < 4}
                    onClick={() =>
                      void act(
                        () =>
                          api.post(`/api-clients/${client.id}/status`, {
                            status: "ACTIVE",
                            reason: statusReason.trim(),
                          }),
                        "Its status has changed since the page loaded. The page now shows it.",
                      )
                    }
                  >
                    Reinstate
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="danger"
                  disabled={busy || statusReason.trim().length < 4}
                  onClick={() =>
                    void act(
                      () =>
                        api.post(`/api-clients/${client.id}/status`, {
                          status: "REVOKED",
                          reason: statusReason.trim(),
                        }),
                      "Its status has changed since the page loaded. The page now shows it.",
                    )
                  }
                >
                  {isPending ? "Refuse registration" : "Revoke access"}
                </Button>
              </div>
            </Section>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Notice({
  title,
  tone = "caution",
  children,
}: {
  title: string;
  tone?: "caution" | "deny";
  children: ReactNode;
}) {
  const styles =
    tone === "deny"
      ? "border-verdict-deny/30 bg-verdict-deny-surface text-verdict-deny"
      : "border-verdict-caution/40 bg-verdict-caution-surface text-verdict-caution";
  return (
    <div className={`rounded-md border px-4 py-3 text-sm ${styles}`}>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-foreground">{children}</p>
    </div>
  );
}
