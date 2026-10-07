"use client";

import { Camera, ImageUp, Trash2, UserRound } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";

import { Button, ErrorNotice } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { PHOTOGRAPH_TYPES, preparedPhotograph } from "@/lib/photograph";

/**
 * The member's photograph (item 41; `QUESTIONS.md` MEM-18): taken with the
 * camera or chosen from the device, uploaded at once, and shown.
 *
 * The upload goes through `POST /media` as a passport photograph. The API
 * reads the bytes to decide what the file is, so nothing here is the control.
 * Only a JPEG or a PNG is sent, because that is what a card can print. The value is the
 * stored file's id and a short-lived signed link to show it; the caller
 * attaches the id to the application.
 *
 * What the photograph must look like is the Union's to say (MEM-14, open), so
 * this states no rule about it.
 */

export interface Photograph {
  id: string;
  /** A signed link, good for a few minutes: for showing, never for storing. */
  url: string;
}

export function PhotographField({
  value,
  onChange,
  discardReplaced = true,
}: {
  value: Photograph | null;
  onChange: (next: Photograph | null) => void;
  /**
   * Whether the picture this one replaces is an upload nothing else holds, and
   * so is discarded. False where the old one is still attached to a record:
   * the API would refuse to discard it, and it is history.
   */
  discardReplaced?: boolean;
}) {
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  /** An upload that was never attached is removed; a failure here is harmless. */
  async function discard(photograph: Photograph | null) {
    if (photograph && discardReplaced) {
      await api.delete(`/media/${photograph.id}`).catch(() => undefined);
    }
  }

  async function chosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // So that choosing the same file again is still a change.
    event.target.value = "";
    if (!file) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const prepared = await preparedPhotograph(file);
      if (!prepared) {
        throw new ApiError(400, "That file could not be used.");
      }
      const uploaded = await api.upload<{ media: { id: string }; url: string }>(
        "/media",
        prepared,
        "PASSPORT_PHOTOGRAPH",
      );
      const previous = value;
      onChange({ id: uploaded.media.id, url: uploaded.url });
      await discard(previous);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? new ApiError(
              caught.status,
              caught.status === 400
                ? "That file could not be used. Choose a JPEG or PNG picture."
                : caught.message,
              caught.requestId,
            )
          : new ApiError(0, "The service could not be reached."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const previous = value;
    onChange(null);
    setError(null);
    await discard(previous);
  }

  return (
    <div className="grid gap-3">
      {error ? (
        <ErrorNotice message={error.message} requestId={error.requestId} />
      ) : null}

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex h-32 w-26 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-surface-muted text-faint-foreground">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived link to the API; next/image would cache and re-serve it.
            <img
              src={api.mediaUrl(value.url)}
              alt="The member’s photograph"
              className="h-full w-full object-cover"
            />
          ) : (
            <UserRound className="size-10" aria-hidden />
          )}
        </div>

        <div className="grid min-w-0 flex-1 gap-2">
          <p className="text-sm text-muted-foreground" role="status">
            {busy
              ? "Uploading the photograph…"
              : value
                ? "This photograph is printed on the member’s card."
                : "No photograph yet. The one taken here is printed on the member’s card."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => cameraInput.current?.click()}
            >
              <Camera aria-hidden />
              {value ? "Take another" : "Take a photograph"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
            >
              <ImageUp aria-hidden />
              Choose a file
            </Button>
            {value ? (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => void remove()}
              >
                <Trash2 aria-hidden />
                Remove
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {/* On a phone the first opens the camera; elsewhere both open a file. */}
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-label="Take a photograph of the member"
        onChange={(event) => void chosen(event)}
      />
      <input
        ref={fileInput}
        type="file"
        accept={PHOTOGRAPH_TYPES}
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose a photograph of the member"
        onChange={(event) => void chosen(event)}
      />
    </div>
  );
}
