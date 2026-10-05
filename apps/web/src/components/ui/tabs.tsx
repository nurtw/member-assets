"use client";

import Link from "next/link";
import { Tabs as TabsPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

/**
 * Tabs within one page (Radix), and `TabLinks` for tabs that are addresses of
 * their own. The selected tab is marked by its weight and an underline as well
 * as its colour.
 */
export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;

const listClass = "flex gap-1 overflow-x-auto border-b border-line";

const tabClass =
  "-mb-px whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground " +
  "transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset";

const selectedClass = "border-primary text-foreground";

export function TabsList({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn(listClass, className)} {...props} />;
}

export function TabsTrigger({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        tabClass,
        "data-[state=active]:border-primary data-[state=active]:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function TabLinks({
  label,
  tabs,
}: {
  /** Names the set for a screen reader. */
  label: string;
  tabs: { href: string; label: string; active: boolean }[];
}) {
  return (
    <nav aria-label={label} className={listClass}>
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={cn(tabClass, tab.active && selectedClass)}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
