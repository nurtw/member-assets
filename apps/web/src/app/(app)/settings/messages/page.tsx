"use client";

import {
  SMS_CHANNELS,
  type SmsChannel,
  type SmsMessageSummary,
  type SmsSettingsState,
  type SmsTemplateState,
} from "@nurtw/contracts";
import { smsRecipient } from "@nurtw/domain";
import { Check, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import useSWR, { type KeyedMutator } from "swr";

import { moment } from "@/components/api-access";
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
  TextArea,
  TextInput,
} from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ApiError, api, fetcher } from "@/lib/api";
import { previewSms, smsStatusExplanation } from "@/lib/sms";

/**
 * Text messages (item 45; PRD Requirement 27.14, revision 1.18;
 * `QUESTIONS.md` GOV-22).
 *
 * Every payment credited to a member is confirmed by SMS through Termii, once
 * the Union's sender name is approved and an administrator switches messages
 * on. The words are the Union's: each change is a new version, with a reason.
 * A test message proves the key, the sender name, and the route first.
 */

type Settings = { sms: SmsSettingsState };

function unreachable(caught: unknown): ApiError {
  return caught instanceof ApiError
    ? caught
    : new ApiError(0, "The service could not be reached.");
}

const ROUTES: Record<SmsChannel, string> = {
  dnd: "Transactional (reaches numbers on do-not-disturb)",
  generic: "Generic (does not reach do-not-disturb numbers)",
};

function Present({ present, label }: { present: boolean; label: string }) {
  const Icon = present ? Check : X;
  return (
    <li className="flex items-center gap-2 text-sm">
      <Icon
        aria-hidden
        className={
          present ? "size-4 text-verdict-affirm" : "size-4 text-verdict-deny"
        }
      />
      <span>
        {label}:{" "}
        <span className="font-medium">{present ? "set" : "not set"}</span>
      </span>
    </li>
  );
}

export default function MessagesPage() {
  const { data, error, isLoading, mutate } = useSWR<Settings>(
    "/notifications/sms",
    fetcher,
  );
  const loadError = error instanceof ApiError ? error : null;
  const sms = data?.sms ?? null;

  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader
        title="Messages"
        description="Text messages to members: a confirmation for every payment credited to them. Off until the Union's sender name is approved and messages are switched on here."
      />
      {loadError ? (
        <ErrorNotice
          message={
            loadError.status === 403
              ? "Only an officer who may change the System's settings can open this screen."
              : loadError.message
          }
          requestId={loadError.requestId}
        />
      ) : null}
      {isLoading ? <Loading /> : null}
      {sms ? (
        <>
          <SendingSection sms={sms} mutate={mutate} />
          <TestSection sms={sms} />
          <Section
            title="The words"
            description="What each message says. {amount}, {member}, {date}, and {owed} are filled in when it is sent. Write naira as N: the naira sign doubles what each message costs."
          >
            <div className="grid gap-4">
              {sms.templates.map((template) => (
                <TemplateEditor
                  key={template.key}
                  template={template}
                  mutate={mutate}
                />
              ))}
            </div>
          </Section>
        </>
      ) : null}
    </div>
  );
}

function SendingSection({
  sms,
  mutate,
}: {
  sms: SmsSettingsState;
  mutate: KeyedMutator<Settings>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  const [senderId, setSenderId] = useState(sms.senderId);
  const [channel, setChannel] = useState<SmsChannel>(sms.channel);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const configured = sms.provider.apiKey && sms.provider.baseUrl;

  async function save() {
    setBusy(true);
    setFailure(null);
    try {
      await mutate(
        await api.put<Settings>("/notifications/sms/settings", {
          senderId: senderId.trim(),
          channel,
          reason: reason.trim(),
        }),
        { revalidate: false },
      );
      toast.success("Saved");
      setEditing(false);
    } catch (caught) {
      setFailure(unreachable(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Sending"
      actions={
        <Button
          type="button"
          variant={sms.enabled ? "secondary" : "primary"}
          disabled={!sms.enabled && !configured}
          onClick={() => setConfirming(true)}
        >
          {sms.enabled ? "Switch messages off" : "Switch messages on"}
        </Button>
      }
    >
      {sms.enabled ? (
        <Notice tone="affirm" title="Messages are on">
          Each payment credited to a member is confirmed to their number within
          a minute.
        </Notice>
      ) : (
        <Notice tone="info" title="Messages are off">
          Payments are still recorded, and each is marked as not messaged.
          Nothing is sent later for them when messages are switched on.
        </Notice>
      )}
      {!configured ? (
        <Notice tone="caution" title="Termii is not set up on the API yet">
          Set TERMII_API_KEY and TERMII_BASE_URL (the account&apos;s own
          address, from Termii&apos;s dashboard) on the API, and
          TERMII_SECRET_KEY for delivery reports. Messages cannot be switched on
          until then.
        </Notice>
      ) : null}
      <ul className="grid gap-1">
        <Present present={sms.provider.apiKey} label="Termii API key" />
        <Present present={sms.provider.baseUrl} label="Termii address" />
        <Present
          present={sms.provider.webhookSecret}
          label="Delivery-report secret"
        />
      </ul>
      <p className="text-sm text-muted-foreground">
        For delivery reports, give Termii the API&apos;s address followed by{" "}
        <code className="font-mono">/api/v1/notifications/sms/delivery</code>.
      </p>

      {editing ? (
        <div className="grid gap-3 rounded-md border border-line p-3">
          {failure ? (
            <ErrorNotice
              message={failure.message}
              requestId={failure.requestId}
            />
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Sender name"
              htmlFor="smsSenderId"
              hint="As registered with Termii: 3 to 11 letters or digits."
              required
            >
              <TextInput
                id="smsSenderId"
                value={senderId}
                maxLength={11}
                onChange={(event) => setSenderId(event.target.value)}
              />
            </Field>
            <Field label="Route" htmlFor="smsChannel" required>
              <Select
                id="smsChannel"
                value={channel}
                onChange={(event) =>
                  setChannel(event.target.value as SmsChannel)
                }
              >
                {SMS_CHANNELS.map((value) => (
                  <option key={value} value={value}>
                    {ROUTES[value]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field
            label="Reason for the change"
            htmlFor="smsSettingsReason"
            hint="Recorded in the audit trail."
            required
          >
            <TextInput
              id="smsSettingsReason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          <div className="flex gap-3">
            <Button
              type="button"
              disabled={
                busy ||
                reason.trim().length < 4 ||
                !/^[A-Za-z0-9 ]{3,11}$/.test(senderId.trim())
              }
              onClick={() => void save()}
            >
              Save
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
        </div>
      ) : (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <DetailList>
            <Detail label="Sender name" value={sms.senderId} />
            <Detail label="Route" value={ROUTES[sms.channel]} />
          </DetailList>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setSenderId(sms.senderId);
              setChannel(sms.channel);
              setReason("");
              setFailure(null);
              setEditing(true);
            }}
          >
            Change
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={sms.enabled ? "Switch messages off?" : "Switch messages on?"}
        description={
          sms.enabled
            ? "Members stop receiving confirmations. Payments made while messages are off are never messaged, even after they are switched back on."
            : `From now on, each payment credited to a member is confirmed by SMS from "${sms.senderId}". The Union pays for each message. Send a test message first.`
        }
        confirmLabel={sms.enabled ? "Switch off" : "Switch on"}
        tone={sms.enabled ? "danger" : "primary"}
        reason={{}}
        onConfirm={async (why) => {
          try {
            await mutate(
              await api.put<Settings>("/notifications/sms/settings", {
                enabled: !sms.enabled,
                reason: why,
              }),
              { revalidate: false },
            );
          } catch (caught) {
            if (caught instanceof ApiError && caught.status === 409) {
              throw new ApiError(
                409,
                "Termii is not set up on the API, so messages cannot be switched on.",
                caught.requestId,
              );
            }
            throw unreachable(caught);
          }
          toast.success(
            sms.enabled ? "Messages switched off" : "Messages switched on",
          );
        }}
      />
    </Section>
  );
}

function TestSection({ sms }: { sms: SmsSettingsState }) {
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [result, setResult] = useState<SmsMessageSummary | null>(null);
  const configured = sms.provider.apiKey && sms.provider.baseUrl;
  const readable = smsRecipient(phone) !== null;

  async function send() {
    setBusy(true);
    setFailure(null);
    setResult(null);
    try {
      const response = await api.post<{ message: SmsMessageSummary }>(
        "/notifications/sms/test",
        { phone: phone.trim() },
      );
      setResult(response.message);
    } catch (caught) {
      setFailure(
        caught instanceof ApiError && caught.status === 503
          ? new ApiError(
              503,
              "Termii is not set up on the API yet.",
              caught.requestId,
            )
          : unreachable(caught),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Send a test message"
      description="One message, sent at once to the number you type, whether or not messages are on. It proves the key, the sender name, and the route. Only the number's last four digits are recorded."
    >
      {failure ? (
        <ErrorNotice message={failure.message} requestId={failure.requestId} />
      ) : null}
      {result ? (
        <Notice
          tone={result.status === "SENT" ? "affirm" : "deny"}
          title={
            result.status === "SENT"
              ? `Handed to Termii for the number ending ${result.recipientLastFour}`
              : "Not sent"
          }
        >
          {smsStatusExplanation(result)}{" "}
          {result.status === "SENT"
            ? "If it does not arrive within a few minutes, check the sender name is approved and, for the transactional route, that Termii has switched it on for the account."
            : ""}
        </Notice>
      ) : null}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <Field
            label="Mobile number"
            htmlFor="smsTestPhone"
            hint="A Nigerian number, like 0803 123 4567."
          >
            <TextInput
              id="smsTestPhone"
              type="tel"
              autoComplete="off"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </Field>
        </div>
        <Button
          type="button"
          disabled={busy || !configured || !readable}
          onClick={() => void send()}
        >
          {busy ? "Sending…" : "Send test message"}
        </Button>
      </div>
    </Section>
  );
}

function TemplateEditor({
  template,
  mutate,
}: {
  template: SmsTemplateState;
  mutate: KeyedMutator<Settings>;
}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(template.body);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const id = `sms-${template.key}`;
  const preview = previewSms(editing ? body : template.body);

  async function save() {
    setBusy(true);
    setFailure(null);
    try {
      await mutate(
        await api.put<Settings>(
          `/notifications/sms/templates/${template.key}`,
          {
            body: body.trim(),
            reason: reason.trim(),
          },
        ),
        { revalidate: false },
      );
      toast.success("Saved");
      setEditing(false);
    } catch (caught) {
      setFailure(unreachable(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3 rounded-md border border-line p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-0.5">
          <p className="text-sm font-semibold">{template.label}</p>
          <p className="text-xs text-muted-foreground">
            {template.version === 0
              ? "The words the System started with."
              : `Version ${template.version}, saved ${moment(template.updatedAt)}.`}
          </p>
        </div>
        {!editing ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setBody(template.body);
              setReason("");
              setFailure(null);
              setEditing(true);
            }}
          >
            Change
          </Button>
        ) : null}
      </div>

      {editing ? (
        <>
          {failure ? (
            <ErrorNotice
              message={failure.message}
              requestId={failure.requestId}
            />
          ) : null}
          <Field label="Words" htmlFor={`${id}-body`} required>
            <TextArea
              id={`${id}-body`}
              rows={3}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </Field>
          {preview.issues.length > 0 ? (
            <Notice
              tone="deny"
              title="This cannot be sent as it is"
              role="alert"
            >
              <ul className="list-disc pl-5">
                {preview.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </Notice>
          ) : null}
        </>
      ) : null}

      <div className="grid gap-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          As a member would read it (example)
        </p>
        <p className="rounded bg-surface-muted px-2 py-1.5 font-mono text-xs break-words">
          {preview.text}
        </p>
        <p className="text-xs text-muted-foreground">
          {preview.parts === 1 ? "One SMS." : `${preview.parts} SMS each time.`}
        </p>
      </div>

      {editing ? (
        <>
          <Field
            label="Reason for the change"
            htmlFor={`${id}-reason`}
            hint="Recorded in the audit trail."
            required
          >
            <TextInput
              id={`${id}-reason`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          <div className="flex gap-3">
            <Button
              type="button"
              disabled={
                busy || preview.issues.length > 0 || reason.trim().length < 4
              }
              onClick={() => void save()}
            >
              Save
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
      ) : null}
    </div>
  );
}
