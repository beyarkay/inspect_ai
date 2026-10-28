import { useSyncExternalStore } from "react";

import { useHtmlFlag } from "@tsmono/inspect-components/pro-ux";

import { useProPref } from "./prefs";

/** A persisted set of row ids, for rows the user has opened. */
const openSet = (storageKey: string) => {
  const read = (): Set<string> => {
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return new Set(
        Array.isArray(parsed)
          ? parsed.filter((v): v is string => typeof v === "string")
          : []
      );
    } catch {
      return new Set();
    }
  };
  let current = read();
  const listeners = new Set<() => void>();
  const set = (next: Set<string>) => {
    current = next;
    try {
      localStorage.setItem(storageKey, JSON.stringify([...next]));
    } catch {
      // Storage unavailable: the rows stay open for this page only.
    }
    for (const listener of listeners) listener();
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  return {
    get: () => current,
    toggle: (id: string) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      set(next);
    },
    setAll: (ids: Iterable<string>) => set(new Set(ids)),
    subscribe,
  };
};

type OpenSet = ReturnType<typeof openSet>;

/** A named hook, not a `.use()` method: the React Compiler only treats
 *  `useXxx` calls as hooks, and caches anything else. */
export const useOpenRows = (rows: OpenSet): Set<string> =>
  useSyncExternalStore(rows.subscribe, rows.get);

/** Log rows whose samples are listed beneath them. */
export const openSampleRows = openSet("pro-ux-task-samples-open");

/** Rows whose task args are laid out in full. */
export const openArgsRows = openSet("pro-ux-task-args-open");

/** Whether grid rows must be measured: soft-wrap is on, or some row has
 *  its task args open. */
export const useRowsGrow = (): boolean => {
  const wrap = useProPref("wrapCells");
  const pro = useHtmlFlag("data-pro-ux");
  const argsOpen = useOpenRows(openArgsRows).size > 0;
  return wrap || (pro && argsOpen);
};
