"use client";

import type {
  StickerStockAddition,
  StickerStockEntry,
  StickerStockList,
} from "@nurtw/contracts";
import { PackageOpen } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";

import { ScanButton, StickerScanDialog } from "@/components/qr-scanner";
import {
  Button,
  Card,
  EmptyState,
  ErrorNotice,
  ListToolbar,
  Loading,
  Notice,
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ApiError, api, fetcher } from "@/lib/api";

/**
 * The sticker stock (PRD Requirement 9A.8, `QUESTIONS.md` VEH-29; item 27).
 *
 * Printed stickers the Union holds are added here by scanning each one. A
 * sticker in stock belongs to no vehicle; it is bound to a plate when it is
 * assigned, on the vehicle's own page, after the sticker fee is paid.
 *
 * Only a holder of `sticker.stock_intake` reaches this screen, and that
 * permission is in no role: a sticker's code proves nothing by itself, so
 * whoever adds one decides which stickers count.
 */

const STANDING_CHIP: Record<StickerStockEntry["standing"], string> = {
  IN_STOCK: "IN_STOCK",
  ATTACHED: "ASSIGNED",
  WITHDRAWN: "WITHDRAWN",
};

/** What became of the last sticker scanned, in words. */
type Outcome = {
  tone: "affirm" | "info" | "caution";
  title: string;
  text: string;
};

function describe(code: string, addition: StickerStockAddition): Outcome {
  if (addition.outcome === "ADDED") {
    return {
      tone: "affirm",
      title: "Added to stock",
      text: `Sticker ${code} is in stock and can be assigned.`,
    };
  }
  switch (addition.held) {
    case "IN_STOCK":
      return {
        tone: "info",
        title: "Already in stock",
        text: `Sticker ${code} was added before. Nothing changed.`,
      };
    case "ON_REGISTER":
      return {
        tone: "info",
        title: "Already on record",
        text: `Sticker ${code} is recorded for a vehicle already, so it is not stock. Nothing changed.`,
      };
    case "ATTACHED":
      return {
        tone: "caution",
        title: "Already on a vehicle",
        text: `Sticker ${code} is assigned to a vehicle. Nothing changed.`,
      };
    case "WITHDRAWN":
      return {
        tone: "caution",
        title: "Withdrawn",
        text: `Sticker ${code} was withdrawn and cannot be added again.`,
      };
  }
}

function Count({ label, value }: { label: string; value: number | undefined }) {
  return (
    <Card className="px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-faint-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">
        {value === undefined ? "–" : value.toLocaleString("en-NG")}
      </p>
    </Card>
  );
}

export default function StickerStockPage() {
  const { data, error, isLoading, mutate } = useSWR<StickerStockList>(
    "/stickers/stock",
    fetcher,
  );
  const [scanning, setScanning] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [added, setAdded] = useState(0);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [search, setSearch] = useState("");
  const [withdrawing, setWithdrawing] = useState<StickerStockEntry | null>(
    null,
  );

  const stickers = data?.stickers ?? [];
  const loadError = error instanceof ApiError ? error : null;
  const wanted = search.replace(/\D/g, "");
  const shown = stickers.filter(
    (sticker) => wanted === "" || sticker.stickerNumber.includes(wanted),
  );

  async function add(code: string) {
    setFailure(null);
    try {
      const addition = await api.post<StickerStockAddition>("/stickers/stock", {
        code,
      });
      setOutcome(describe(code, addition));
      if (addition.outcome === "ADDED") {
        setAdded((count) => count + 1);
      }
      await mutate();
    } catch (caught) {
      setOutcome(null);
      setFailure(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, "The service could not be reached."),
      );
    }
  }

  const scan = (
    <ScanButton
      onClick={() => {
        setOutcome(null);
        setFailure(null);
        setAdded(0);
        setScanning(true);
      }}
    >
      Scan stickers in
    </ScanButton>
  );
  const last = failure ? (
    <ErrorNotice message={failure.message} requestId={failure.requestId} />
  ) : outcome ? (
    <Notice tone={outcome.tone} title={outcome.title} role="status">
      {outcome.text}
    </Notice>
  ) : null;

  return (
    <div className="grid max-w-5xl gap-6">
      <PageHeader
        title="Sticker stock"
        description="Printed stickers the Union holds, added by scanning each one. A sticker in stock belongs to no vehicle until it is assigned on that vehicle's page."
        actions={scan}
      />

      {loadError ? (
        <ErrorNotice
          message={loadError.message}
          requestId={loadError.requestId}
        />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Count label="In stock" value={data?.counts.inStock} />
        <Count label="Assigned" value={data?.counts.attached} />
        <Count label="Withdrawn" value={data?.counts.withdrawn} />
      </div>

      {!scanning && failure ? (
        <ErrorNotice message={failure.message} requestId={failure.requestId} />
      ) : !scanning && added > 0 ? (
        <Notice tone="affirm" title="Added to stock" role="status">
          {added === 1
            ? "1 sticker was added. It can now be assigned to a vehicle."
            : `${added} stickers were added. They can now be assigned to vehicles.`}
        </Notice>
      ) : null}

      {isLoading ? (
        <Loading />
      ) : stickers.length === 0 && !loadError ? (
        <EmptyState
          icon={<PackageOpen aria-hidden />}
          title="No stickers in stock yet"
          description="Scan each printed sticker to add it. Once a sticker is in stock it can be assigned to a vehicle after the sticker fee is paid."
          action={scan}
        />
      ) : stickers.length > 0 ? (
        <>
          <ListToolbar
            count={
              data?.truncated
                ? `${shown.length} of the latest ${stickers.length}`
                : listCount(shown.length, stickers.length)
            }
          >
            <div className="min-w-48 flex-1 sm:max-w-xs">
              <label htmlFor="stockSearch" className="sr-only">
                Search by sticker number
              </label>
              <TextInput
                id="stockSearch"
                type="search"
                inputMode="numeric"
                placeholder="Search by sticker number"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </ListToolbar>

          {data?.truncated ? (
            <p className="text-sm text-muted-foreground">
              Only the latest {stickers.length} are listed. To find an older
              one, scan it: the answer says where it stands.
            </p>
          ) : null}

          {shown.length === 0 ? (
            <EmptyState
              title="None match"
              description="No sticker listed has that number. Clear the search to see them all."
            />
          ) : (
            <Table stacked className="sm:min-w-[44rem]">
              <TableHead>
                <tr>
                  <TableHeader>Sticker number</TableHeader>
                  <TableHeader>Standing</TableHeader>
                  <TableHeader>Added</TableHeader>
                  <TableHeader>
                    <span className="sr-only">Actions</span>
                  </TableHeader>
                </tr>
              </TableHead>
              <TableBody>
                {shown.map((sticker) => (
                  <TableRow key={sticker.id}>
                    <TableCell className="font-mono text-sm font-medium">
                      {sticker.stickerNumber}
                    </TableCell>
                    <TableCell label="Standing">
                      <span>
                        <StatusChip status={STANDING_CHIP[sticker.standing]} />
                        {sticker.attachedPlate ? (
                          <span className="mt-1 block font-mono text-xs text-muted-foreground">
                            on {sticker.attachedPlate}
                          </span>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell label="Added" className="text-muted-foreground">
                      {new Date(sticker.addedAt).toLocaleDateString("en-GB")}
                      {sticker.addedBy ? ` · ${sticker.addedBy}` : ""}
                    </TableCell>
                    <TableCell className="sm:text-right">
                      {sticker.standing === "IN_STOCK" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setWithdrawing(sticker)}
                        >
                          Withdraw
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </>
      ) : null}

      <StickerScanDialog
        open={scanning}
        onOpenChange={setScanning}
        continuous
        title="Scan stickers into stock"
        description="Point the camera at each sticker's QR code in turn. Each one is added as it is read."
        status={
          <div className="grid gap-2">
            {last}
            <p className="text-center text-sm text-muted-foreground">
              {added === 0 ? "Nothing added yet." : `${added} added so far.`}
            </p>
          </div>
        }
        onCode={(code) => void add(code)}
      />

      <ConfirmDialog
        open={withdrawing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setWithdrawing(null);
          }
        }}
        title="Withdraw this sticker?"
        description={
          <p>
            Sticker{" "}
            <span className="font-mono font-semibold">
              {withdrawing?.stickerNumber}
            </span>{" "}
            will leave stock for good. It can never be assigned, and its number
            cannot be added again. Use this for a sticker that is lost, damaged,
            or was scanned by mistake.
          </p>
        }
        confirmLabel="Withdraw the sticker"
        reason={{
          hint: "Recorded in the audit trail: lost, damaged, added by mistake.",
        }}
        onConfirm={async (reason) => {
          if (!withdrawing) {
            return;
          }
          await api.post(`/stickers/stock/${withdrawing.id}/withdrawal`, {
            reason,
          });
          toast.success(`Sticker ${withdrawing.stickerNumber} withdrawn`);
          await mutate();
        }}
      />
    </div>
  );
}
