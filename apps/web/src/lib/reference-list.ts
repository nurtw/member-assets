/**
 * The Union's reference lists as the screen handles them (item 39): pure
 * rules, tested without a browser.
 *
 * A list is shown in the order the API returns it, which is by each entry's
 * order number and then its label. An officer moves an entry; what is sent is
 * the order number of every entry whose number has to change.
 */

/** What a code may be. The API holds the same rule and is the control. */
export const CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/;

export function isCode(value: string): boolean {
  return value.length >= 2 && value.length <= 64 && CODE_PATTERN.test(value);
}

/** A code as it is typed: upper case, with a space or a dash made an underscore. */
export function asCode(typed: string): string {
  return typed.toUpperCase().replace(/[\s-]+/g, "_");
}

export type Move = "TOP" | "UP" | "DOWN";

interface Ordered {
  id: string;
  sortOrder: number;
}

/** The step between order numbers, so one entry can later be put between two. */
const STEP = 10;

/**
 * The order numbers to save so that `id` moves as asked. `entries` is the list
 * as shown. Every entry is given a number by its new place, and only those
 * whose number changes are returned, so a move that changes nothing sends
 * nothing.
 */
export function moved<T extends Ordered>(
  entries: readonly T[],
  id: string,
  move: Move,
): { id: string; sortOrder: number }[] {
  const from = entries.findIndex((entry) => entry.id === id);
  if (from < 0) {
    return [];
  }
  const to =
    move === "TOP"
      ? 0
      : move === "UP"
        ? Math.max(0, from - 1)
        : Math.min(entries.length - 1, from + 1);
  if (to === from) {
    return [];
  }
  const next = [...entries];
  const [entry] = next.splice(from, 1);
  next.splice(to, 0, entry!);
  return next
    .map((item, index) => ({ id: item.id, sortOrder: (index + 1) * STEP }))
    .filter(
      (change) =>
        entries.find((item) => item.id === change.id)?.sortOrder !==
        change.sortOrder,
    );
}

/** The order number that puts a new entry at the end of the list. */
export function orderAtEnd(entries: readonly Ordered[]): number {
  return (
    entries.reduce((most, entry) => Math.max(most, entry.sortOrder), 0) + STEP
  );
}
