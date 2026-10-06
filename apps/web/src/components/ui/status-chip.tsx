import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleX,
  Clock3,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * A status chip.
 *
 * The status word is the content; the icon and tone repeat it. Read this in
 * greyscale and it still says APPROVED or REJECTED, with a tick or a cross,
 * which is DESIGN.md §3 applied to the smallest component that carries a
 * verdict.
 */

type Tone = "affirm" | "deny" | "caution" | "waiting" | "neutral";

const TONES: Record<Tone, { className: string; icon: LucideIcon }> = {
  affirm: {
    className:
      "border-verdict-affirm/30 bg-verdict-affirm-surface text-verdict-affirm",
    icon: CircleCheck,
  },
  deny: {
    className:
      "border-verdict-deny/30 bg-verdict-deny-surface text-verdict-deny",
    icon: CircleX,
  },
  caution: {
    className:
      "border-verdict-caution/30 bg-verdict-caution-surface text-verdict-caution",
    icon: CircleAlert,
  },
  // Awaiting someone's decision: the caution tone, with a clock rather than an
  // alarm, because nothing is wrong yet.
  waiting: {
    className:
      "border-verdict-caution/30 bg-verdict-caution-surface text-verdict-caution",
    icon: Clock3,
  },
  neutral: {
    className: "border-line bg-surface-muted text-muted-foreground",
    icon: CircleDashed,
  },
};

const STATUS_TONES: Record<string, Tone> = {
  DRAFT: "neutral",
  SUBMITTED: "waiting",
  UNDER_REVIEW: "waiting",
  APPROVED: "affirm",
  ACTIVE: "affirm",
  REJECTED: "deny",
  CANCELLED: "deny",
  SUSPENDED: "deny",
  WITHDRAWN: "neutral",
  PENDING: "neutral",
  // Vehicle declaration (PRD §9). RETIRED and ARCHIVED are terminal but not a
  // refusal, so they read as WITHDRAWN does: closed, not denied. DISPUTED is
  // neither affirmed nor denied yet: an unresolved conflict reads as caution.
  RETIRED: "neutral",
  ARCHIVED: "neutral",
  DISPUTED: "caution",
  // Revision 1.2/1.3: on record is neither affirmed nor refused. The vehicle is
  // known, not declared. Neutral, like PENDING; the words carry it.
  ON_RECORD: "neutral",
  // Dues (PRD Requirement 27.8, item 22). Owed is the current period unpaid: a
  // caution. In arrears is an earlier one unpaid. Not due is neutral.
  PAID: "affirm",
  OWED: "caution",
  IN_ARREARS: "deny",
  NOT_DUE: "neutral",
  // API clients and tokens (item 11). A revoked organisation or token is
  // refused for good. A token being replaced still works, until it stops.
  REVOKED: "deny",
  CURRENT: "affirm",
  RETIRING: "caution",
  // Officer accounts (item 28). A deactivated account is closed, not denied.
  DEACTIVATED: "neutral",
  // Cards (PRD §8). Awaiting approval waits on an officer; issued is printed
  // and valid, awaiting collection; lost wants attention; replaced is closed.
  PENDING_APPROVAL: "waiting",
  ISSUED: "affirm",
  LOST: "caution",
  REPLACED: "neutral",
  DAMAGED: "caution",
  // Invitations (item 33). Open is waiting on the organisation; used did its
  // work; expired and withdrawn are closed, not refused. An organisation whose
  // token has run out reads EXPIRED too, and is as neutral.
  OPEN: "waiting",
  USED: "affirm",
  EXPIRED: "neutral",
  // Sticker stock (item 27). In stock is held and not yet on a vehicle;
  // assigned did its work. Withdrawn reads as WITHDRAWN does above.
  IN_STOCK: "neutral",
  ASSIGNED: "affirm",
};

export function StatusChip({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const tone = TONES[STATUS_TONES[status] ?? "neutral"];
  const Icon = tone.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border py-0.5 pl-1.5 pr-2.5 text-xs font-semibold tracking-wide",
        tone.className,
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden strokeWidth={2.25} />
      {status.replace(/_/g, " ")}
    </span>
  );
}
