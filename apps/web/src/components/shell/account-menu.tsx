"use client";

import { ChevronsUpDown, LogOut, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { ThemeMenuItems } from "@/components/shell/theme";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/cn";

/** "Ada Obi" → "AO"; one word → its first letter. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length > 1 ? [words[0], words[words.length - 1]] : words;
  return letters.map((word) => word.charAt(0).toUpperCase()).join("") || "?";
}

/**
 * The signed-in person, at the foot of the sidebar: their own screens, the
 * theme, and signing out.
 */
export function AccountMenu({
  name,
  detail,
  collapsed,
  links,
  onSignOut,
}: {
  name: string;
  /** The line beneath the name: an email, or an organisation. */
  detail: string;
  collapsed: boolean;
  links: { href: string; label: string; icon: LucideIcon }[];
  onSignOut: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex w-full items-center gap-2.5 rounded-md p-1.5 text-left transition-colors hover:bg-surface-muted data-[state=open]:bg-surface-muted",
          collapsed && "justify-center",
        )}
      >
        <span
          aria-hidden
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-on-solid"
        >
          {initials(name)}
        </span>
        {collapsed ? (
          <span className="sr-only">Account: {name}</span>
        ) : (
          <>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-medium">{name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {detail}
              </span>
            </span>
            <ChevronsUpDown
              className="size-4 shrink-0 text-faint-foreground"
              aria-hidden
            />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm font-medium text-foreground">
            {name}
          </span>
          <span className="block truncate text-xs">{detail}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {links.map((link) => (
            <DropdownMenuItem key={link.href} asChild>
              <Link href={link.href}>
                <link.icon aria-hidden />
                {link.label}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <ThemeMenuItems />
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSignOut}>
          <LogOut aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
