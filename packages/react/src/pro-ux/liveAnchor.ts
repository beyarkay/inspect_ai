import { useMemo } from "react";

/** Keys a virtual list's rows by identity instead of position, so measured
 *  sizes follow their row. While live, the row at the top of the view also
 *  keeps its place when rows are inserted above it: TanStack's "end" anchor
 *  re-finds that row by key after every change in row count. */
export const useLiveAnchor = <T>(
  data: readonly T[],
  itemKey: ((item: T) => string) | undefined,
  live: boolean | undefined
) => {
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
    anchorTo: live && itemKey ? ("end" as const) : ("start" as const),
  };
};
