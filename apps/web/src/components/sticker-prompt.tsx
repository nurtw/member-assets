"use client";

import type { OnboardingState } from "@nurtw/contracts";
import {
  NEW_STICKERS_IN_USE,
  stickerCanBeGiven,
  stickerOffer,
  type StickerOffer,
} from "@nurtw/domain";
import { Sticker } from "lucide-react";
import useSWR from "swr";

import { Button, Notice } from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetcher } from "@/lib/api";
import { useSession } from "@/lib/session";

/**
 * Making sticker assignment obvious (item 35, `QUESTIONS.md` VEH-30): a banner
 * on every vehicle without a sticker, and a prompt when one has just been
 * added.
 *
 * What the vehicle can be given comes from the onboarding state, which only a
 * holder of `sticker.attach` may read. Anyone else is told the vehicle has no
 * sticker and who can assign one. Nothing here takes money: payment is started
 * in the panel on the vehicle's page, and only where a sticker can be given.
 * A vehicle with no sticker recorded for its plate, while stock holds none, is
 * told so and charged nothing.
 */

/** The onboarding panel reads the same key, so the state is fetched once. */
export function onboardingKey(vehicleId: string): string {
  return `/stickers/onboarding/${vehicleId}`;
}

export function useStickerOffer(
  vehicleId: string,
  attached: boolean,
): {
  /** `null` while it is not yet known, or not this officer's to know. */
  offer: StickerOffer | null;
  canAttach: boolean;
  needsRouteType: boolean;
} {
  const { holds } = useSession();
  const canAttach = holds("sticker.attach");
  const { data } = useSWR<{ onboarding: OnboardingState }>(
    canAttach && !attached ? onboardingKey(vehicleId) : null,
    fetcher,
  );
  if (attached) {
    return { offer: "ATTACHED", canAttach, needsRouteType: false };
  }
  const state = data?.onboarding;
  if (!state) {
    return { offer: null, canAttach, needsRouteType: false };
  }
  return {
    offer: stickerOffer({
      attached: state.attachment !== null,
      registerHoldsBarcodeForPlate: state.registerHoldsBarcodeForPlate,
      stockHasStickers: state.stockHasStickers,
      newStickersInUse: NEW_STICKERS_IN_USE,
    }),
    canAttach,
    needsRouteType: !state.hasRouteType,
  };
}

const NOTHING_YET =
  "There is no sticker to give it yet: none is recorded for this plate, and stock holds none. Stickers are added to stock by scanning them. Nothing is charged.";

function whatToDo(offer: StickerOffer, needsRouteType: boolean): string {
  const first = needsRouteType ? "Set its route type, then take" : "Take";
  return offer === "REATTACH"
    ? `A sticker is recorded for this plate. ${first} the reattachment fee, then scan the sticker the vehicle carries.`
    : `${first} the sticker fee, then scan a sticker from stock.`;
}

/** At the top of a vehicle's page, on every view, until a sticker is attached. */
export function StickerBanner({
  vehicleId,
  attached,
  onAssign,
}: {
  vehicleId: string;
  attached: boolean;
  /** Takes the officer to the onboarding panel. */
  onAssign: () => void;
}) {
  const { offer, canAttach, needsRouteType } = useStickerOffer(
    vehicleId,
    attached,
  );
  if (attached) {
    return null;
  }
  if (!canAttach) {
    return (
      <Notice tone="caution" icon={Sticker} title="No sticker yet">
        No sticker is assigned to this vehicle. An officer who can assign
        stickers does that from this page.
      </Notice>
    );
  }
  if (offer === null) {
    return null;
  }
  if (!stickerCanBeGiven(offer)) {
    return (
      <Notice tone="info" icon={Sticker} title="No sticker yet">
        {NOTHING_YET}
      </Notice>
    );
  }
  return (
    <Notice
      tone="caution"
      icon={Sticker}
      title="No sticker yet"
      action={
        <Button type="button" onClick={onAssign}>
          Assign sticker
        </Button>
      }
    >
      {whatToDo(offer, needsRouteType)}
    </Notice>
  );
}

/**
 * After a vehicle is added, for an officer who can attach a sticker. Closing it
 * lasts for that visit; the banner on the vehicle's page carries on asking.
 */
export function StickerPromptDialog({
  vehicleId,
  plate,
  open,
  onAssign,
  onLater,
}: {
  vehicleId: string;
  plate: string;
  open: boolean;
  onAssign: () => void;
  onLater: () => void;
}) {
  const { offer, needsRouteType } = useStickerOffer(vehicleId, false);
  const canBeGiven = offer !== null && stickerCanBeGiven(offer);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onLater();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Vehicle saved: {plate}</DialogTitle>
          <DialogDescription>
            {offer === null
              ? "Checking whether a sticker can be assigned…"
              : canBeGiven
                ? `It has no sticker yet. ${whatToDo(offer, needsRouteType)}`
                : `It has no sticker yet. ${NOTHING_YET}`}
          </DialogDescription>
        </DialogHeader>
        {canBeGiven ? (
          <p className="text-sm text-muted-foreground">
            If you leave it for now, the vehicle&apos;s page will remind you
            each time it is opened.
          </p>
        ) : null}
        <DialogFooter>
          {canBeGiven ? (
            <>
              <Button type="button" variant="secondary" onClick={onLater}>
                Later
              </Button>
              <Button type="button" onClick={onAssign}>
                Assign sticker now
              </Button>
            </>
          ) : (
            <Button type="button" onClick={onLater}>
              OK
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
