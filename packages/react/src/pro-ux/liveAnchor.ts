import { useMemo, useState } from "react";

import { useTimeout } from "../hooks/useTimeout";

/** How long the anchor outlasts a live list, so the final batch of events
 *  loaded when a sample finishes lands without moving the reader. */
const kSettleMs = 3000;

/** Keys a virtual list's rows by identity instead of position, so measured
 *  sizes follow their row. While live, the row at the top of the view also
 *  keeps its place when rows are inserted above it: TanStack's "end" anchor
 *  re-finds that row by key after every change in row count. */
export const useLiveAnchor = <T>(
  data: readonly T[],
  itemKey: ((item: T) => string) | undefined,
  live: boolean | undefined
) => {
  const isLive = !!live;
  const [wasLive, setWasLive] = useState(isLive);
  const [settling, setSettling] = useState(false);
  // TanStack applies options during render, so the render where live ends
  // must already anchor, before the state below catches up.
  const ending = wasLive && !isLive;
  if (wasLive !== isLive) {
    setWasLive(isLive);
    setSettling(ending);
  }
  useTimeout(() => setSettling(false), settling ? kSettleMs : null);

  const getItemKey = useMemo(
    () =>
      itemKey &&
      ((index: number): string | number => {
        const item = data[index];
        return item === undefined ? index : itemKey(item);
      }),
    [data, itemKey]
  );
  return {
    getItemKey,
    anchorTo:
      itemKey && (isLive || ending || settling)
        ? ("end" as const)
        : ("start" as const),
  };
};
