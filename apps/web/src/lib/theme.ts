/**
 * The colour theme (item 32): Light, Dark, or System.
 *
 * System is the default and is no attribute at all: `globals.css` follows
 * `prefers-color-scheme` until an officer chooses otherwise. An explicit choice
 * is `data-theme` on `<html>`, set before the first paint by `THEME_SCRIPT` so a
 * dark screen never flashes white on load (Next 16's "preventing flash before
 * hydration" guide).
 *
 * The choice is a convenience of this device, kept in `localStorage`. Every read
 * and write is guarded: a private window or blocked storage must leave the page
 * working, in the System theme.
 */

export const THEME_STORAGE_KEY = "nurtw-theme";

export const THEME_CHOICES = ["system", "light", "dark"] as const;

export type ThemeChoice = (typeof THEME_CHOICES)[number];

export const THEME_LABELS: Record<ThemeChoice, string> = {
  system: "Follow the device",
  light: "Light",
  dark: "Dark",
};

/** Anything unrecognised, a missing value included, is System. */
export function parseThemeChoice(value: unknown): ThemeChoice {
  return value === "light" || value === "dark" ? value : "system";
}

/** The `data-theme` value for a choice; System sets none. */
export function themeAttribute(choice: ThemeChoice): "light" | "dark" | null {
  return choice === "system" ? null : choice;
}

/**
 * Runs in `<head>`, before anything is painted. Kept to the two explicit values,
 * so a tampered entry in storage can only ever fall back to System.
 *
 * If a content security policy is added (item 15), it must allow this script by
 * its hash.
 */
export const THEME_SCRIPT =
  `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});` +
  `if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}}` +
  `catch(e){}})()`;
