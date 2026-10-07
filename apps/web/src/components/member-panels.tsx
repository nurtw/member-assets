"use client";

import type { CardSummary, VehicleSummary } from "@nurtw/contracts";
import { suggestCardAddress } from "@nurtw/domain";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";

import {
  Button,
  ErrorNotice,
  Field,
  Section,
  StatusChip,
  TextInput,
  buttonVariants,
} from "@/components/ui";
import { ApiError, api, fetcher } from "@/lib/api";
import { useSession } from "@/lib/session";

/**
 * A member's vehicles and a member's card, as panels (item 37).
 *
 * Both are keyed by the member, so the application's page and the member's
 * record show the same thing from the same requests. A migrated member has no
 * application, and still has vehicles and may hold a card.
 */

/** The address of a member's vehicle list, shared so the pages can count it. */
export function memberVehiclesKey(memberId: string): string {
  return `/vehicles?memberId=${memberId}`;
}

export function MemberVehiclesPanel({
  memberId,
  addHref,
}: {
  memberId: string;
  /** Where "Add a vehicle" goes. Left out, it is not offered. */
  addHref?: string | null;
}) {
  const { holds } = useSession();
  const canSeeVehicles = holds("vehicle.read");
  const canAddVehicle = holds("vehicle.record") || holds("vehicle.declare");
  const { data } = useSWR<{ vehicles: VehicleSummary[] }>(
    canSeeVehicles ? memberVehiclesKey(memberId) : null,
    fetcher,
  );
  const vehicles = data?.vehicles ?? [];

  return (
    <Section
      title="Vehicles"
      description="Vehicles this member drives. A vehicle added here is on record only until it is declared and a sticker is attached."
      actions={
        canAddVehicle && addHref ? (
          <Link
            href={addHref}
            className={buttonVariants({ variant: "secondary" })}
          >
            Add a vehicle
          </Link>
        ) : null
      }
    >
      {vehicles.length > 0 ? (
        <ul className="grid gap-2">
          {vehicles.map((vehicle) => (
            <li
              key={vehicle.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line px-3 py-2"
            >
              <Link
                href={`/vehicles/${vehicle.id}`}
                className="font-mono text-sm font-medium text-link underline-offset-2 hover:underline"
              >
                {vehicle.plateNumberDisplay}
              </Link>
              <span className="text-sm text-muted-foreground">
                {vehicle.routeType?.label ?? "No route type"}
              </span>
              {/* VEH-28 — present only for a holder of vehicle.declare. */}
              {vehicle.status ? <StatusChip status={vehicle.status} /> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-faint-foreground">No vehicle recorded.</p>
      )}
    </Section>
  );
}

export function MemberCardPanel({
  memberId,
  residentialAddress,
}: {
  memberId: string;
  /**
   * The address the officer is already looking at, where they may see it. The
   * card address is suggested from it in the browser; the card module never
   * reads `member_contact` (Decision 10.1).
   */
  residentialAddress?: string | null;
}) {
  const { holds } = useSession();
  /**
   * The card address, before the officer has touched it.
   *
   * `null` means "not yet edited", so the suggested value shows through. Once
   * the officer types — including clearing the field entirely — the state holds
   * a string and the suggestion no longer applies. That keeps the default out
   * of an effect, so nothing races the fetch and nothing overwrites what the
   * officer has typed when the data revalidates.
   */
  const [cardAddress, setCardAddress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const { data, mutate } = useSWR<{ cards: CardSummary[] }>(
    `/cards?memberId=${memberId}`,
    fetcher,
  );
  const cards = data?.cards ?? [];
  const liveCard = cards.find((card) =>
    ["DRAFT", "PENDING_APPROVAL", "ISSUED", "ACTIVE"].includes(card.status),
  );

  const suggestedAddress = suggestCardAddress(residentialAddress);
  const printedAddress = cardAddress ?? suggestedAddress;

  async function prepare() {
    setBusy(true);
    setError(null);
    try {
      await api.post("/cards", {
        memberId,
        printedAddress: printedAddress.trim(),
      });
      setCardAddress(null);
      await mutate();
      toast.success("Card prepared");
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Membership card"
      description="A member holds one card at a time. A replacement supersedes the original rather than overwriting it."
    >
      {cards.length > 0 ? (
        <ul className="grid gap-2">
          {cards.map((card) => (
            <li
              key={card.id}
              className="flex flex-wrap items-center gap-3 rounded-md border border-line px-3 py-2"
            >
              <StatusChip status={card.status} />
              <span className="font-mono text-xs text-muted-foreground">
                {card.cardNumber ?? (
                  <span className="font-sans italic text-faint-foreground">
                    Not yet issued
                  </span>
                )}
              </span>
              <Link
                href={`/cards/${card.id}`}
                className="ml-auto text-sm underline underline-offset-2"
              >
                Open
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-faint-foreground">
          No card has been prepared.
        </p>
      )}

      {!liveCard && holds("card.issue") ? (
        <div className="grid gap-4 border-t border-line pt-4">
          {error ? (
            <ErrorNotice message={error.message} requestId={error.requestId} />
          ) : null}
          <Field
            label="Address as printed on the card"
            htmlFor="cardAddress"
            hint={
              suggestedAddress
                ? "Suggested from the residential address, shortened to fit the card. Amend it if the Union prints something different."
                : "The address the Union prints on this member’s card."
            }
            required
          >
            <TextInput
              id="cardAddress"
              value={printedAddress}
              onChange={(event) => setCardAddress(event.target.value)}
            />
          </Field>
          <div>
            <Button
              type="button"
              disabled={busy || printedAddress.trim().length < 4}
              onClick={() => void prepare()}
            >
              Prepare a card
            </Button>
          </div>
        </div>
      ) : null}
    </Section>
  );
}
