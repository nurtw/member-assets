"use client";

import type { PortalMe } from "@nurtw/contracts";

import {
  fieldLabel,
  moment,
  scopeDescription,
  shortDay,
} from "@/components/api-access";
import { PortalTokensSection } from "@/components/portal-tokens";
import { PortalUsageSection } from "@/components/portal-usage";
import { PageHeader, Section, StatusChip } from "@/components/ui";
import { usePortalSession } from "@/lib/portal-session";

/**
 * The organisation's own view of its access (item 29, EXT-20): where it
 * stands, what it may ask and see, its limits, its usage, and its tokens.
 *
 * Everything about its access is read-only here. The Union's API
 * administrator decides it, and this page says so rather than offering a
 * control that would refuse.
 */
export default function PortalOverviewPage() {
  const { me, refresh } = usePortalSession();
  if (!me) {
    return null;
  }
  const organisation = me.organisation;
  const approved = organisation.approvedAt !== null;

  return (
    <div className="grid gap-6">
      <PageHeader
        title={organisation.name}
        description="Your organisation's access to the NURTW verification API."
      />

      <Standing organisation={organisation} />

      {approved ? (
        <>
          <Section
            title="What you may ask, and what the answers carry"
            description="Set by the Union when it approved your organisation. To ask for a change, contact the Union's API administrator."
          >
            <dl className="grid gap-5 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-faint-foreground">
                  Scopes
                </dt>
                <dd className="mt-1.5">
                  {organisation.scopes.length === 0 ? (
                    <span className="text-sm italic text-faint-foreground">
                      None
                    </span>
                  ) : (
                    <ul className="grid gap-2 text-sm">
                      {organisation.scopes.map((scope) => (
                        <li key={scope}>
                          <span className="font-mono text-xs">{scope}</span>
                          <span className="block text-muted-foreground">
                            {scopeDescription(scope)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-faint-foreground">
                  A match may carry
                </dt>
                <dd className="mt-1.5 text-sm">
                  {organisation.disclosureProfile ? (
                    <>
                      <span className="font-medium">
                        {organisation.disclosureProfile.label}
                      </span>
                      {organisation.disclosureProfile.fields.length === 0 ? (
                        <p className="mt-1 italic text-muted-foreground">
                          No record field. A response confirms a match and
                          nothing more.
                        </p>
                      ) : (
                        <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                          {organisation.disclosureProfile.fields.map(
                            (field) => (
                              <li key={field}>{fieldLabel(field)}</li>
                            ),
                          )}
                        </ul>
                      )}
                      <p className="mt-2 text-xs text-faint-foreground">
                        A match confirms only that an NURTW record exists under
                        the criteria checked. It is not evidence of ownership,
                        roadworthiness, licensing, or insurance.
                      </p>
                    </>
                  ) : (
                    <span className="italic text-faint-foreground">
                      Nothing yet
                    </span>
                  )}
                </dd>
              </div>
            </dl>
            {organisation.limits ? (
              <dl className="grid gap-4 border-t border-line pt-4 sm:grid-cols-4">
                <Limit
                  label="Verifications"
                  value={`${organisation.limits.verificationPerMinute} a minute`}
                />
                <Limit
                  label="Totals"
                  value={`${organisation.limits.aggregatePerMinute} a minute`}
                />
                <Limit
                  label="In a burst"
                  value={`${organisation.limits.burst} at once`}
                />
                <Limit
                  label="Daily quota"
                  value={`${organisation.limits.dailyQuota.toLocaleString("en-NG")} a day`}
                />
              </dl>
            ) : null}
            <p className="text-xs text-faint-foreground">
              A request over a limit answers 429 with a Retry-After header, and
              is not counted against your quota. Send your own X-Request-ID with
              every request.
            </p>
          </Section>

          <PortalUsageSection limits={organisation.limits} />
        </>
      ) : null}

      <PortalTokensSection onChanged={() => void refresh()} />
    </div>
  );
}

function Limit({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-faint-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-medium">{value}</dd>
    </div>
  );
}

/** Where the organisation stands, in a word and a sentence, never by colour alone. */
function Standing({
  organisation,
}: {
  organisation: PortalMe["organisation"];
}) {
  const sentence: Record<string, string> = {
    PENDING: organisation.applicationExpiresAt
      ? `Awaiting the Union's decision. The API administrator will telephone you, or write, to confirm your application. It lapses on ${shortDay(organisation.applicationExpiresAt)} if it has not been approved by then.`
      : "Awaiting the Union's decision. Nothing can be done here until your organisation is approved.",
    ACTIVE: "Approved and active.",
    EXPIRED:
      "Approved, but your token has run out and nothing has replaced it, so your requests are refused. Create a new token below.",
    SUSPENDED:
      "Suspended by the Union. Your tokens are refused until it is reinstated. Contact the Union's API administrator.",
    REVOKED:
      "Access has been withdrawn, or the application was not approved. Contact the Union's API administrator.",
  };

  return (
    <section className="rounded-lg border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center gap-3">
        <StatusChip status={organisation.status} />
        <p className="text-sm">{sentence[organisation.status]}</p>
      </div>
      <p className="mt-2 text-xs text-faint-foreground">
        Applied {shortDay(organisation.appliedAt)}
        {organisation.approvedAt
          ? ` · approved ${shortDay(organisation.approvedAt)}`
          : ""}
      </p>
      {organisation.pausedUntil ? (
        <p
          role="status"
          className="mt-3 rounded-md border border-verdict-caution/40 bg-verdict-caution-surface px-3 py-2 text-sm"
        >
          <span className="font-semibold">Requests are paused</span> until{" "}
          {moment(organisation.pausedUntil)}. Requests sent before then answer
          429. If you believe this is a mistake, contact the Union&apos;s API
          administrator.
        </p>
      ) : null}
    </section>
  );
}
