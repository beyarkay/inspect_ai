import { useMemo } from "react";

import { useHtmlFlag } from "@tsmono/inspect-components/pro-ux";

import { fitHeaders, useFontsLoaded } from "./headerFit";
import { useProPref } from "./prefs";

export const kEmptyColumnWidth = 28;

interface ColumnLike<TRow> {
  id?: string;
  header?: unknown;
  accessorFn?: (row: TRow, index: number) => unknown;
  size?: number;
  minSize?: number;
  maxSize?: number;
  flex?: number;
}

const isEmptyValue = (value: unknown): boolean => {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "" || value === "-";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
};

/** Ids of columns whose accessor yields nothing for every row. */
export const emptyColumnIds = <TRow>(
  columns: readonly ColumnLike<TRow>[],
  rows: readonly TRow[]
): Set<string> => {
  const empty = new Set<string>();
  if (rows.length === 0) return empty;
  for (const c of columns) {
    if (c.id === undefined || c.accessorFn === undefined) continue;
    const accessor = c.accessorFn;
    if (rows.every((row, i) => isEmptyValue(accessor(row, i)))) empty.add(c.id);
  }
  return empty;
};

/** Move `ids` to the end of `order`, keeping relative order otherwise. */
export const moveToEnd = (
  order: readonly string[],
  ids: ReadonlySet<string>
): string[] => [
  ...order.filter((id) => !ids.has(id)),
  ...order.filter((id) => ids.has(id)),
];

/** Narrow empty columns and report their ids, and under the pro-ux skin widen
 *  the rest so no header label is cut short. */
export const useCollapsedEmptyColumns = <TRow, C extends ColumnLike<TRow>>(
  columns: readonly C[],
  rows: readonly TRow[]
): { columns: C[]; emptyIds: Set<string> } => {
  const enabled = useProPref("collapseEmptyColumns");
  const skin = useHtmlFlag("data-pro-ux");
  const fontsLoaded = useFontsLoaded();
  return useMemo(() => {
    const emptyIds = enabled
      ? emptyColumnIds(columns, rows)
      : new Set<string>();
    const fitted =
      skin && fontsLoaded
        ? fitHeaders(columns, emptyIds, (c) => c.id)
        : columns;
    if (emptyIds.size === 0) return { columns: [...fitted], emptyIds };
    return {
      columns: fitted.map((c) =>
        c.id !== undefined && emptyIds.has(c.id)
          ? {
              ...c,
              size: kEmptyColumnWidth,
              minSize: kEmptyColumnWidth,
              maxSize: kEmptyColumnWidth,
              flex: undefined,
            }
          : c
      ),
      emptyIds,
    };
  }, [enabled, skin, fontsLoaded, columns, rows]);
};
