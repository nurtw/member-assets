"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * The open tab of a record's page, kept in the address (`?tab=`), so a link
 * can lead straight to a tab and a reload opens the same one (item 34).
 *
 * The first tab is the default and leaves the address bare. A tab that is not
 * offered, whether because the record's state or the officer's permissions
 * leave it out, opens the first instead. Other query values are kept.
 *
 * Only for pages rendered on demand (a record's `[id]` page): reading the
 * query on a prerendered page needs a Suspense boundary.
 */
export function useTabParam(
  tabs: readonly { value: string }[],
): [string, (next: string) => void] {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const first = tabs[0]?.value ?? "";
  const asked = searchParams.get("tab") ?? first;
  const tab = tabs.some((entry) => entry.value === asked) ? asked : first;

  function setTab(next: string) {
    const query = new URLSearchParams(searchParams.toString());
    if (next === first) {
      query.delete("tab");
    } else {
      query.set("tab", next);
    }
    const text = query.toString();
    router.replace(text ? `${pathname}?${text}` : pathname, { scroll: false });
  }

  return [tab, setTab];
}
