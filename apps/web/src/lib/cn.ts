import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Joins class names, and lets a caller's class win over a component's own when
 * the two set the same property: `px-6` passed to a Button replaces its `px-4`.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
