import { useMemo } from "react";

import { useProPref } from "./prefs";

export const kEmptyColumnWidth = 28;

interface ColumnLike<TRow> {
  id?: string;
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

/** Narrow empty columns and report their ids; a no-op when the pref is off. */
export const useCollapsedEmptyColumns = <TRow, C extends ColumnLike<TRow>>(
  columns: readonly C[],
  rows: readonly TRow[]
): { columns: C[]; emptyIds: Set<string> } => {
  const enabled = useProPref("collapseEmptyColumns");
  return useMemo(() => {
    const emptyIds = enabled
      ? emptyColumnIds(columns, rows)
      : new Set<string>();
    if (emptyIds.size === 0) return { columns: [...columns], emptyIds };
    return {
      columns: columns.map((c) =>
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
  }, [enabled, columns, rows]);
};
