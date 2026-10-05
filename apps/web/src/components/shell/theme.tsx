"use client";

import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useSyncExternalStore } from "react";

import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import {
  THEME_CHOICES,
  THEME_LABELS,
  THEME_STORAGE_KEY,
  parseThemeChoice,
  themeAttribute,
  type ThemeChoice,
} from "@/lib/theme";

/**
 * The theme choice in React (item 32). `lib/theme.ts` holds the rules; this
 * keeps the page, the storage, and every open tab in step.
 */

const CHANGE = "nurtw-theme-change";

// Where the choice lives when storage refuses to keep it: this page, until it
// is closed.
let unstored: ThemeChoice = "system";

function readChoice(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === null ? unstored : parseThemeChoice(stored);
  } catch {
    return unstored;
  }
}

function apply(choice: ThemeChoice) {
  const attribute = themeAttribute(choice);
  if (attribute) {
    document.documentElement.setAttribute("data-theme", attribute);
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

function subscribe(onChange: () => void) {
  // A choice made in another tab arrives as a storage event.
  const fromOtherTab = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) {
      apply(readChoice());
      onChange();
    }
  };
  window.addEventListener(CHANGE, onChange);
  window.addEventListener("storage", fromOtherTab);
  return () => {
    window.removeEventListener(CHANGE, onChange);
    window.removeEventListener("storage", fromOtherTab);
  };
}

export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(subscribe, readChoice, () => "system");
}

export function setThemeChoice(choice: ThemeChoice) {
  unstored = choice;
  try {
    if (choice === "system") {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      window.localStorage.setItem(THEME_STORAGE_KEY, choice);
    }
  } catch {
    // Kept for this page only; see `unstored`.
  }
  apply(choice);
  window.dispatchEvent(new Event(CHANGE));
}

export const THEME_ICONS: Record<ThemeChoice, LucideIcon> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

/** The three choices, for an account menu. */
export function ThemeMenuItems() {
  const choice = useThemeChoice();
  return (
    <>
      <DropdownMenuLabel>Theme</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={choice}
        onValueChange={(value) => setThemeChoice(parseThemeChoice(value))}
      >
        {THEME_CHOICES.map((option) => {
          const Icon = THEME_ICONS[option];
          return (
            <DropdownMenuRadioItem key={option} value={option}>
              <Icon aria-hidden />
              {THEME_LABELS[option]}
            </DropdownMenuRadioItem>
          );
        })}
      </DropdownMenuRadioGroup>
    </>
  );
}
