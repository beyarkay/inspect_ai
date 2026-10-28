import { useCallback, useRef } from "react";

import { useDebouncedCallback } from "@tsmono/react/hooks";

import type { GrepOptions } from "../transcript-search/searchRequest";
import type { SearchType } from "../transcript-search/types";

import { useHtmlFlag } from "./useHtmlFlag";

export const kAutoRunDelayMs = 500;

/** Identity of a grep search, or null when nothing should run on its own.
 *  LLM searches cost money, so they only ever run on Enter or Run. */
export const autoRunKey = (
  searchType: SearchType,
  query: string,
  options: GrepOptions
): string | null => {
  const text = query.trim();
  if (searchType !== "grep" || !text) return null;
  return JSON.stringify([
    text,
    options.ignoreCase,
    options.regex,
    options.wordBoundary,
  ]);
};

/** Pro-UX: a grep search runs itself once typing pauses for 500ms.
 *  Call `schedule` after each query or option change and when a search
 *  settles (a pause during a search is skipped), and `ran` when a search
 *  starts, so the same search is not run twice. */
export const useAutoRun = (
  key: string | null,
  busy: boolean,
  run: () => void
) => {
  const enabled = useHtmlFlag("data-pro-ux");
  const last = useRef<string | null>(null);
  const schedule = useDebouncedCallback(() => {
    if (!enabled || busy || key === null || key === last.current) return;
    last.current = key;
    run();
  }, kAutoRunDelayMs);
  const ran = useCallback(
    (startedKey: string | null) => {
      schedule.cancel();
      last.current = startedKey;
    },
    [schedule]
  );
  return { enabled, schedule, ran };
};
