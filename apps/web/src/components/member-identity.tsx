"use client";

import type {
  MemberNinState,
  MemberPhotograph,
  MemberRecord,
} from "@nurtw/contracts";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import {
  PhotographField,
  type Photograph,
} from "@/components/photograph-field";
import {
  Button,
  Detail,
  DetailList,
  ErrorNotice,
  Field,
  Section,
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
import { ApiError, api } from "@/lib/api";
import { isNin, ninStatement } from "@/lib/nin";

/**
 * A member's NIN and photograph on their record (item 44; PRD Requirement
 * 7.4).
 *
 * Both are changed by an officer holding `member.update` over the member, and
 * by nobody once the membership is cancelled. A NIN is typed in and never
 * read back: the API seals it, and says only whether one is recorded and, to
 * a reader of a record's sensitive part, its last four digits.
 */

/** The API answers a conflict generically (Requirement 14.3); this says what one means here. */
function explainNin(caught: unknown): ApiError {
  if (!(caught instanceof ApiError)) {
    return new ApiError(0, "The service could not be reached.");
  }
  if (caught.status === 409) {
    return new ApiError(
      409,
      "This NIN could not be recorded. It may already be recorded for another member. If it was recorded against the wrong member, take it off that record first.",
      caught.requestId,
    );
  }
  if (caught.status === 503) {
    return new ApiError(
      503,
      "A NIN cannot be recorded at the moment, because the System is not set up to keep it sealed. Ask an administrator.",
      caught.requestId,
    );
  }
  return caught;
}

export function MemberNinSection({
  member,
  canChange,
  onChanged,
}: {
  member: MemberRecord;
  canChange: boolean;
  onChanged: () => Promise<unknown>;
}) {
  const [recording, setRecording] = useState(false);
  const [removing, setRemoving] = useState(false);
  const lastFour = member.sensitive?.ninLastFour ?? null;

  async function remove(reason: string) {
    try {
      await api.post(`/members/${member.id}/nin/removal`, { reason });
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        throw new ApiError(
          409,
          "This NIN can no longer be removed here. Close this, reload the page, and look again.",
          caught.requestId,
        );
      }
      throw caught instanceof ApiError
        ? caught
        : new ApiError(0, "The service could not be reached.");
    }
    toast.success("NIN removed");
    await onChanged();
  }

  return (
    <Section
      title="National Identification Number"
      description="Kept sealed, and never printed or shown in full. An officer who may read contact details sees its last four digits."
      actions={
        canChange ? (
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setRecording(true)}
            >
              {member.ninRecorded ? "Replace the NIN" : "Record the NIN"}
            </Button>
            {member.ninRecorded ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setRemoving(true)}
              >
                Remove
              </Button>
            ) : null}
          </>
        ) : null
      }
    >
      <DetailList>
        <Detail
          label="NIN"
          value={ninStatement({
            ninRecorded: member.ninRecorded,
            ninLastFour: lastFour,
          })}
        />
      </DetailList>

      {recording ? (
        <NinDialog
          member={member}
          onClose={() => setRecording(false)}
          onDone={async (state) => {
            toast.success(
              state.ninLastFour
                ? `NIN ending ${state.ninLastFour} recorded`
                : "NIN recorded",
            );
            await onChanged();
          }}
        />
      ) : null}
      {removing ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setRemoving(false)}
          title="Take this NIN off the record?"
          description={
            <p>
              The NIN{lastFour ? ` ending ${lastFour}` : ""} comes off{" "}
              {member.firstName} {member.surname}’s record. Do this only when it
              was recorded against the wrong member, so that it can be recorded
              on the right one. The reason is kept in the audit trail.
            </p>
          }
          confirmLabel="Remove the NIN"
          reason={{}}
          onConfirm={(reason) => remove(reason)}
        />
      ) : null}
    </Section>
  );
}

function NinDialog({
  member,
  onClose,
  onDone,
}: {
  member: MemberRecord;
  onClose: () => void;
  onDone: (state: MemberNinState) => Promise<void>;
}) {
  const [nin, setNin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const replacing = member.ninRecorded;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!isNin(nin)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await api.put<{ identity: MemberNinState }>(
        `/members/${member.id}/nin`,
        { nin },
      );
      await onDone(response.identity);
      onClose();
    } catch (caught) {
      setError(explainNin(caught));
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
              {replacing ? "Replace the NIN" : "Record the NIN"}
            </DialogTitle>
            <DialogDescription>
              {replacing
                ? `The number typed here replaces the one on ${member.firstName} ${member.surname}’s record. The one it replaces is not shown, and cannot be.`
                : `Type ${member.firstName} ${member.surname}’s National Identification Number from their NIN slip or card.`}
            </DialogDescription>
          </DialogHeader>
          {error && error.details.length === 0 ? (
            <ErrorNotice message={error.message} requestId={error.requestId} />
          ) : null}
          <Field
            label="NIN"
            htmlFor="memberNin"
            required
            hint="Eleven digits. Spaces and dashes are taken out."
            error={error?.fieldError("nin")}
          >
            <TextInput
              id="memberNin"
              inputMode="numeric"
              autoComplete="off"
              maxLength={20}
              value={nin}
              onChange={(event) => setNin(event.target.value)}
              autoFocus
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !isNin(nin)}>
              {busy ? "Saving…" : "Save the NIN"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MemberPhotographSection({
  member,
  canChange,
  onChanged,
}: {
  member: MemberRecord;
  canChange: boolean;
  onChanged: () => Promise<unknown>;
}) {
  // What was just saved is shown at once; the record is then read again.
  const [saved, setSaved] = useState<Photograph | null>(null);
  const onRecord =
    member.passportPhotoId && member.passportPhotoUrl
      ? { id: member.passportPhotoId, url: member.passportPhotoUrl }
      : null;

  async function upload(file: File): Promise<Photograph> {
    const response = await api.upload<{ photograph: MemberPhotograph }>(
      `/members/${member.id}/photograph`,
      file,
      "PASSPORT_PHOTOGRAPH",
    );
    return {
      id: response.photograph.passportPhotoId,
      url: response.photograph.passportPhotoUrl,
    };
  }

  return (
    <Section
      title="Photograph"
      description={
        canChange ? "Taken now, or chosen from this device." : undefined
      }
    >
      <PhotographField
        value={saved ?? onRecord}
        onChange={(next) => {
          setSaved(next);
          toast.success("Photograph saved");
          void onChanged();
        }}
        upload={upload}
        // The API attaches it and discards the one it replaces.
        discardReplaced={false}
        context="record"
        readOnly={!canChange}
      />
    </Section>
  );
}
