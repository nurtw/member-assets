"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";

import { Notice } from "@/components/ui";
import { api } from "@/lib/api";
import {
  STARTING_NOTE_MS,
  WAKE_ATTEMPTS,
  WAKE_ATTEMPT_MS,
} from "@/lib/sign-in";

/**
 * Waking the API from a sign-in page (item 41).
 *
 * A host that puts an idle API to sleep makes its next caller wait while it
 * starts: more than two minutes when it was measured on 7 October 2026. An
 * officer who has typed a correct password and sees nothing happen concludes
 * the System is broken.
 *
 * So the page asks the public health check for a sign of life as soon as it
 * opens. That request is what starts the API, while the officer is still
 * typing. If no answer has come after a few seconds the page says the System
 * is starting, so the wait has a reason on the screen.
 *
 * The health check carries no credential and says nothing about any record.
 */

export type Wake = "CHECKING" | "STARTING" | "READY" | "UNREACHABLE";

export function useApiWake(): Wake {
  const [slow, setSlow] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);

  // A key of its own, so no screen's cached answer stands in for this one.
  const { data } = useSWR(
    "wake:/health",
    () =>
      api.get<{ status: string }>("/health", undefined, {
        timeoutMs: WAKE_ATTEMPT_MS,
      }),
    {
      revalidateOnFocus: false,
      dedupingInterval: 0,
      onErrorRetry: (_error, _key, _config, revalidate, { retryCount }) => {
        if (retryCount >= WAKE_ATTEMPTS) {
          setGaveUp(true);
          return;
        }
        setTimeout(() => void revalidate({ retryCount }), 3_000);
      },
    },
  );

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), STARTING_NOTE_MS);
    return () => clearTimeout(timer);
  }, []);

  if (data) {
    return "READY";
  }
  if (gaveUp) {
    return "UNREACHABLE";
  }
  return slow ? "STARTING" : "CHECKING";
}

/** What the wait is for, in words. Nothing while the API answers promptly. */
export function ApiWakeNotice({ wake }: { wake: Wake }) {
  if (wake === "STARTING") {
    return (
      <Notice tone="info" title="The System is starting up" role="status">
        After a quiet spell this can take a minute or two. Fill in your details
        meanwhile. Signing in waits for it, so there is no need to press the
        button twice.
      </Notice>
    );
  }
  if (wake === "UNREACHABLE") {
    return (
      <Notice tone="caution" title="The System cannot be reached" role="status">
        Check your connection, then reload this page.
      </Notice>
    );
  }
  return null;
}
