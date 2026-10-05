import {
  CircleAlert,
  CircleCheck,
  CircleX,
  Info,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * A notice on a page: a title in words, an icon, and a tone, so no notice
 * depends on its colour to be understood (DESIGN.md §3).
 */

type NoticeTone = "info" | "affirm" | "caution" | "deny";

const NOTICE_TONES: Record<
  NoticeTone,
  { box: string; title: string; icon: LucideIcon }
> = {
  info: {
    box: "border-line bg-surface-muted",
    title: "text-foreground",
    icon: Info,
  },
  affirm: {
    box: "border-verdict-affirm/30 bg-verdict-affirm-surface",
    title: "text-verdict-affirm",
    icon: CircleCheck,
  },
  caution: {
    box: "border-verdict-caution/40 bg-verdict-caution-surface",
    title: "text-verdict-caution",
    icon: CircleAlert,
  },
  deny: {
    box: "border-verdict-deny/30 bg-verdict-deny-surface",
    title: "text-verdict-deny",
    icon: CircleX,
  },
};

export function Notice({
  tone = "info",
  title,
  children,
  role,
  icon,
  action,
  className,
}: {
  tone?: NoticeTone;
  title: string;
  children?: ReactNode;
  role?: "alert" | "status";
  /** In place of the tone's own icon, where a better one says what it is about. */
  icon?: LucideIcon;
  /** The one thing to do about it: beside the text, or beneath it on a phone. */
  action?: ReactNode;
  className?: string;
}) {
  const style = NOTICE_TONES[tone];
  const Icon = icon ?? style.icon;
  return (
    <div
      role={role}
      className={cn(
        "flex flex-col gap-3 rounded-lg border px-4 py-3 text-sm sm:flex-row sm:items-center",
        style.box,
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 gap-3">
        <Icon
          className={cn("mt-0.5 size-4 shrink-0", style.title)}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className={cn("font-semibold", style.title)}>{title}</p>
          {children ? (
            <div className="mt-1 text-foreground">{children}</div>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0 pl-7 sm:pl-0">{action}</div> : null}
    </div>
  );
}

/**
 * A failure notice.
 *
 * Shows the request id when there is one. The API's messages are deliberately
 * uninformative, so the id is the only thing that makes a report actionable.
 */
export function ErrorNotice({
  message,
  requestId,
}: {
  message: string;
  requestId?: string;
}) {
  return (
    <Notice tone="deny" title="Unable to continue" role="alert">
      <p>{message}</p>
      {requestId ? (
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          Reference {requestId}
        </p>
      ) : null}
    </Notice>
  );
}
