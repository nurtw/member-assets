"use client";

import type { MemberSearchResult } from "@nurtw/contracts";
import { useEffect, useRef, useState } from "react";

import { Field, TextInput } from "@/components/ui";
import { ApiError, api } from "@/lib/api";

/**
 * Finds and picks a member by name or membership number.
 *
 * Backed by `GET /members`, gated on `member.read` — a narrower permission
 * than `application.read`, chosen so this works anywhere a vehicle can be
 * declared or amended without also requiring the picking officer to hold
 * application-review access. Selection is by id; the visible text is a
 * convenience, never sent back to the API.
 */
export function MemberPicker({
  label,
  htmlFor,
  hint,
  selectedId,
  selectedLabel,
  onSelect,
  onClear,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  selectedId: string | null;
  selectedLabel: string | null;
  onSelect: (member: { id: string; label: string }) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemberSearchResult[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Whether a dropdown makes sense at all — derived from `query` at render
  // time rather than mirrored into its own state, so the "too short to
  // search" case needs no `setState` call of its own inside the effect
  // below (which would otherwise fire synchronously on every keystroke).
  const trimmed = query.trim();
  const open = trimmed.length >= 2 && !dismissed;

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    if (trimmed.length < 2) {
      return;
    }
    debounceRef.current = setTimeout(() => {
      setSearching(true);
      api
        .get<{ members: MemberSearchResult[] }>(
          `/members?q=${encodeURIComponent(trimmed)}`,
        )
        .then((response) => setResults(response.members))
        .catch((caught) => {
          // A picker is a convenience; a failed lookup should not block the
          // form it lives on the way a page-level ErrorNotice would.
          if (!(caught instanceof ApiError)) {
            throw caught;
          }
        })
        .finally(() => setSearching(false));
    }, 300);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [trimmed]);

  if (selectedId) {
    return (
      <Field label={label} htmlFor={htmlFor} hint={hint}>
        <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm">
          <span>{selectedLabel}</span>
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-medium text-black/55 underline hover:text-black/80"
          >
            Change
          </button>
        </div>
      </Field>
    );
  }

  return (
    <Field label={label} htmlFor={htmlFor} hint={hint}>
      <div className="relative">
        <TextInput
          id={htmlFor}
          value={query}
          placeholder="Search by name or membership number"
          onChange={(event) => {
            setDismissed(false);
            setQuery(event.target.value);
          }}
          onFocus={() => setDismissed(false)}
          onBlur={() => setTimeout(() => setDismissed(true), 150)}
          autoComplete="off"
        />
        {open ? (
          <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border border-[var(--border-subtle)] bg-white text-sm shadow-md">
            {searching ? (
              <li className="px-3 py-2 text-black/50">Searching…</li>
            ) : results.length === 0 ? (
              <li className="px-3 py-2 text-black/50">No members found.</li>
            ) : (
              results.map((member) => {
                const label = [
                  member.surname,
                  member.firstName,
                  member.middleName,
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <li key={member.id}>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        onSelect({ id: member.id, label });
                        setQuery("");
                        setDismissed(true);
                      }}
                      className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-[var(--surface-muted)]"
                    >
                      <span className="font-medium">{label}</span>
                      <span className="text-xs text-black/55">
                        {member.membershipNumber ?? "No membership number"} ·{" "}
                        {member.organisation.name}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        ) : null}
      </div>
    </Field>
  );
}
