"use client";

import type { IssuedApiToken, PortalTokens } from "@nurtw/contracts";
import { useState } from "react";
import useSWR from "swr";

import { moment, shortDay } from "@/components/api-access";
import {
  Button,
  ErrorNotice,
  Field,
  Section,
  Select,
  StatusChip,
} from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ApiError, api, fetcher } from "@/lib/api";

/**
 * The organisation's own API tokens (item 29, EXT-20).
 *
 * It creates, replaces, and revokes them itself, so the token is seen by the
 * organisation and nobody at the Union. The System keeps only a fingerprint,
 * so a token is shown once and cannot be shown again. What a token may do is
 * the administrator's to decide and is not changed here.
 */

const OVERLAPS = [
  { value: "ONE_DAY", label: "Keep the old token working for 24 hours" },
  { value: "SEVEN_DAYS", label: "Keep the old token working for 7 days" },
  { value: "ONE_HOUR", label: "Keep the old token working for 1 hour" },
  { value: "NONE", label: "Stop the old token at once" },
];

const STATES: Record<string, string> = {
  CURRENT: "In use",
  RETIRING: "Being replaced",
  REPLACED: "Replaced",
  EXPIRED: "Expired",
  REVOKED: "Revoked",
};

export function PortalTokensSection({ onChanged }: { onChanged: () => void }) {
  const { data, error, mutate } = useSWR<PortalTokens>(
    "/portal/tokens",
    fetcher,
  );
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [issued, setIssued] = useState<string | null>(null);
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const [overlap, setOverlap] = useState("ONE_DAY");
  const [revokeId, setRevokeId] = useState("");
  const [revoking, setRevoking] = useState(false);

  const tokens = data?.tokens ?? [];
  const current = tokens.find((token) => token.state === "CURRENT") ?? null;
  const revocable = tokens.filter(
    (token) => token.state === "CURRENT" || token.state === "RETIRING",
  );

  async function act(
    action: () => Promise<IssuedApiToken | unknown>,
    conflict: string,
  ) {
    setBusy(true);
    setFailure(null);
    try {
      const result = (await action()) as Partial<IssuedApiToken> | undefined;
      if (result && typeof result.token === "string") {
        setIssued(result.token);
        setCopy("idle");
      }
      await mutate();
      onChanged();
    } catch (caught) {
      setFailure(
        caught instanceof ApiError
          ? caught.status === 409
            ? new ApiError(409, conflict, caught.requestId)
            : caught
          : new ApiError(0, "The service could not be reached."),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="API tokens"
      description="The token your systems send as “Authorization: Bearer …”. It is shown once, when created or replaced, and to you alone: keep it in your server's secret store, never in a browser, an app, or a URL."
    >
      {error instanceof ApiError ? (
        <ErrorNotice message={error.message} requestId={error.requestId} />
      ) : null}
      {failure ? (
        <ErrorNotice
          message={failure.fieldError("reason") ?? failure.message}
          requestId={failure.requestId}
        />
      ) : null}

      {issued ? (
        <div
          aria-labelledby="portal-token-title"
          className="rounded-lg border-2 border-verdict-caution bg-verdict-caution-surface p-5"
        >
          <h3 id="portal-token-title" className="text-base font-semibold">
            Copy this token now — it will not be shown again
          </h3>
          <p className="mt-1 text-sm">
            Only a fingerprint of it is kept, so neither you nor the Union can
            display it again. If it is lost or exposed, replace or revoke it
            here.
          </p>
          <p
            className="mt-3 select-all break-all rounded-md border border-line bg-surface px-3 py-2 font-mono text-sm"
            aria-label="API token"
          >
            {issued}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(issued);
                  setCopy("copied");
                } catch {
                  setCopy("failed");
                }
              }}
            >
              Copy token
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIssued(null)}
            >
              I have stored it
            </Button>
            <span role="status" className="text-sm">
              {copy === "copied"
                ? "Copied."
                : copy === "failed"
                  ? "Could not copy. Select the token and copy it by hand."
                  : ""}
            </span>
          </div>
        </div>
      ) : null}

      {data && !data.canManage ? (
        <p className="text-sm italic text-faint-foreground">
          Tokens can be created once the Union has approved your organisation
          and while it is active.
        </p>
      ) : null}

      {tokens.length > 0 ? (
        // Wider than a phone: it scrolls sideways inside its own box, so
        // the page itself never does.
        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-faint-foreground">
              <tr>
                <th scope="col" className="py-1.5 font-medium">
                  Token
                </th>
                <th scope="col" className="py-1.5 font-medium">
                  State
                </th>
                <th scope="col" className="py-1.5 font-medium">
                  Expires
                </th>
                <th scope="col" className="py-1.5 font-medium">
                  Last used
                </th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((token) => (
                <tr key={token.id} className="border-t border-line">
                  <td className="whitespace-nowrap py-2 pr-4 font-mono text-xs">
                    {token.prefix}…
                  </td>
                  <td className="py-2">
                    <StatusChip status={token.state} />
                    <span className="sr-only">{STATES[token.state]}</span>
                    {token.state === "RETIRING" && token.retiresAt ? (
                      <span className="block text-xs text-faint-foreground">
                        Works until {moment(token.retiresAt)}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2">
                    {shortDay(token.expiresAt)}
                    {token.expiringSoon ? (
                      <span className="block text-xs font-medium text-verdict-caution">
                        Expires soon: replace it
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 text-muted-foreground">
                    {token.lastUsedAt ? moment(token.lastUsedAt) : "Never"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {data?.canManage && !current ? (
        <div>
          <Button
            type="button"
            disabled={busy}
            onClick={() =>
              void act(
                () => api.post<IssuedApiToken>("/portal/tokens"),
                "A token could not be created: your organisation is not active, or it already has a token in use.",
              )
            }
          >
            Create a token
          </Button>
        </div>
      ) : null}

      {data?.canManage && current ? (
        <div className="grid gap-3 border-t border-line pt-4">
          <h3 className="text-sm font-semibold">Replace the token in use</h3>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1">
              <Field
                label="The old token"
                htmlFor="portalOverlap"
                hint="An overlap lets you deploy the new token without an outage."
              >
                <Select
                  id="portalOverlap"
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
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void act(
                  () =>
                    api.post<IssuedApiToken>(
                      `/portal/tokens/${current.id}/rotate`,
                      { overlap },
                    ),
                  "The token could not be replaced: it is no longer the one in use, or your organisation is not active.",
                )
              }
            >
              Replace the token
            </Button>
          </div>
        </div>
      ) : null}

      {revocable.length > 0 ? (
        <div className="grid gap-3 border-t border-line pt-4">
          <h3 className="text-sm font-semibold">Revoke a token</h3>
          <p className="text-sm text-muted-foreground">
            For a token that may have leaked. It stops at once, and cannot be
            brought back.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Token" htmlFor="portalRevokeToken" required>
              <Select
                id="portalRevokeToken"
                value={revokeId}
                onChange={(event) => setRevokeId(event.target.value)}
              >
                <option value="">Choose a token</option>
                {revocable.map((token) => (
                  <option key={token.id} value={token.id}>
                    {token.prefix}… ({STATES[token.state]?.toLowerCase()})
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div>
            <Button
              type="button"
              variant="danger"
              disabled={busy || !revokeId}
              onClick={() => setRevoking(true)}
            >
              Revoke the token
            </Button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={revoking}
        onOpenChange={setRevoking}
        title="Revoke this token?"
        description={
          <p>
            The token stops at once and cannot be brought back. Anything still
            using it is refused from its next request.
          </p>
        }
        confirmLabel="Revoke the token"
        reason={{ hint: "Recorded with the revocation." }}
        onConfirm={async (reason) => {
          try {
            await api.post(`/portal/tokens/${revokeId}/revoke`, { reason });
          } catch (caught) {
            if (caught instanceof ApiError && caught.status === 409) {
              await mutate();
              throw new ApiError(
                409,
                "That token is already revoked.",
                caught.requestId,
              );
            }
            throw caught;
          }
          setRevokeId("");
          await mutate();
          onChanged();
        }}
      />
    </Section>
  );
}
