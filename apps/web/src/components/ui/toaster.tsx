"use client";

import type { CSSProperties } from "react";
import { Toaster as Sonner } from "sonner";

import { useThemeChoice } from "@/components/shell/theme";

/**
 * Where a success is confirmed (`toast(...)` from `sonner`). A failure stays on
 * the page, beside what failed, with its reference: a toast that disappears is
 * no place for a request id somebody has to report.
 */
export function Toaster() {
  const theme = useThemeChoice();
  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      closeButton
      style={
        {
          "--normal-bg": "var(--surface-raised)",
          "--normal-text": "var(--foreground)",
          "--normal-border": "var(--border-subtle)",
        } as CSSProperties
      }
    />
  );
}
