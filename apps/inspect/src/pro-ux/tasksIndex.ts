import type { LogListRow } from "../app/log-list/grid/columns/types";
import type {
  ValueAccessor,
  ValueComparator,
} from "../app/log-list/listing/types";
import type { SamplesListingRow } from "../log_data";

import {
  firstNumericScore,
  maxBinShare,
  scoreStats,
  type ScoreStats,
} from "./taskStats";

/** Every sample summary under the log dir, grouped by log file. */
export interface SampleIndex {
  byLog: Map<string, SamplesListingRow[]>;
  stats: Map<string, ScoreStats | null>;
  maxShare: number;
  /** Changes whenever a value the Tasks table sorts by changes. */
  signature: string;
}

export const logKey = (row: LogListRow): string => row.log?.name ?? "";

const fnv1a = (text: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
};

export const buildIndex = (rows: SamplesListingRow[]): SampleIndex => {
  const byLog = new Map<string, SamplesListingRow[]>();
  for (const row of rows) {
    const list = byLog.get(row.logFile) ?? [];
    list.push(row);
    byLog.set(row.logFile, list);
  }
  const stats = new Map<string, ScoreStats | null>();
  for (const [file, list] of byLog) {
    const values = list
      .map((r) => firstNumericScore(r.derived.scores))
      .filter((v): v is number => v !== null);
    stats.set(file, scoreStats(values));
  }
  const signature = fnv1a(
    [...byLog.keys()]
      .sort()
      .map(
        (file) =>
          `${file}\t${byLog.get(file)?.length}\t${stats.get(file)?.mean}`
      )
      .join("\n")
  );
  return {
    byLog,
    stats,
    maxShare: maxBinShare(stats.values()),
    signature,
  };
};

/** A log row's score as its badge shows it: the headline metric, else the
 *  mean of its sample scores. */
export const shownScore = (
  row: LogListRow,
  index: SampleIndex
): number | undefined => row.score ?? index.stats.get(logKey(row))?.mean;

/** A log row's sample count, from the samples themselves when the log's
 *  results don't carry it. */
export const shownSampleCount = (
  row: LogListRow,
  index: SampleIndex
): number | undefined =>
  row.totalSamples ?? index.byLog.get(logKey(row))?.length;

const isMissing = (v: unknown): boolean =>
  v === null ||
  v === undefined ||
  v === "" ||
  (typeof v === "number" && Number.isNaN(v));

/** Numbers ascending; missing values last in both directions (the listing
 *  negates the result for descending, so they are pinned against that). */
export const missingLastCompare: ValueComparator = (a, b, isDescending) => {
  const aMissing = isMissing(a);
  const bMissing = isMissing(b);
  if (aMissing && bMissing) return 0;
  if (aMissing) return isDescending ? -1 : 1;
  if (bMissing) return isDescending ? 1 : -1;
  return Number(a) - Number(b);
};

export interface ListingAccessors {
  getValue: ValueAccessor<LogListRow>;
  getComparator: (columnId: string) => ValueComparator | undefined;
}

/** The listing query's accessors with Score and Samples reading the values
 *  the Tasks table shows, so sorting and filtering match the cells. */
export const tasksListingAccessors = (
  base: ListingAccessors,
  index: SampleIndex
): ListingAccessors => ({
  getValue: (row, columnId) => {
    if (columnId === "score") return shownScore(row, index);
    if (columnId === "totalSamples") return shownSampleCount(row, index);
    return base.getValue(row, columnId);
  },
  getComparator: (columnId) =>
    columnId === "score" ? missingLastCompare : base.getComparator(columnId),
});

/** `items` with the one whose id is `id` moved right after `after`;
 *  unchanged when either is absent. */
export const moveAfter = <T extends { id?: string }>(
  items: T[],
  id: string,
  after: string
): T[] => {
  const item = items.find((c) => c.id === id);
  if (!item || !items.some((c) => c.id === after)) return items;
  const rest = items.filter((c) => c !== item);
  const at = rest.findIndex((c) => c.id === after);
  return [...rest.slice(0, at + 1), item, ...rest.slice(at + 1)];
};
