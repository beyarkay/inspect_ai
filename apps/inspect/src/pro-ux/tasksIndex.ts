import type { LogListRow } from "../app/log-list/grid/columns/types";
import type {
  ValueAccessor,
  ValueComparator,
} from "../app/log-list/listing/types";
import type { SamplesListingRow } from "../log_data";

import { scaleTop } from "./cells";
import {
  firstScorerScore,
  kHistogramBins,
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

/** One task's scorer keeps one scale across runs. */
const scaleKey = (row: SamplesListingRow, scorer: string): string =>
  `${row.log.task ?? row.logFile}\t${scorer}`;

/** The scale fitting every scorer a log uses; null if any has none. */
const sharedTop = (tops: (number | null)[]): number | null => {
  const known = tops.filter((t): t is number => t !== null);
  return known.length > 0 && known.length === tops.length
    ? Math.max(...known)
    : null;
};

/** Scales are guessed per task and scorer from every log's samples, so a run
 *  whose samples all scored 1 reads 1/100 when another run reached 74. */
export const buildIndex = (rows: SamplesListingRow[]): SampleIndex => {
  const byLog = new Map<string, SamplesListingRow[]>();
  const scored = new Map<string, { key: string; value: number }[]>();
  const pooled = new Map<string, number[]>();
  for (const row of rows) {
    const list = byLog.get(row.logFile) ?? [];
    list.push(row);
    byLog.set(row.logFile, list);
    const score = firstScorerScore(row.derived.scores);
    if (!score) continue;
    const key = scaleKey(row, score.scorer);
    const values = pooled.get(key) ?? [];
    values.push(score.value);
    pooled.set(key, values);
    const entries = scored.get(row.logFile) ?? [];
    entries.push({ key, value: score.value });
    scored.set(row.logFile, entries);
  }
  const tops = new Map<string, number | null>();
  for (const [key, values] of pooled) tops.set(key, scaleTop(values));
  const stats = new Map<string, ScoreStats | null>();
  for (const file of byLog.keys()) {
    const entries = scored.get(file) ?? [];
    const keys = [...new Set(entries.map((e) => e.key))];
    stats.set(
      file,
      scoreStats(
        entries.map((e) => e.value),
        kHistogramBins,
        sharedTop(keys.map((k) => tops.get(k) ?? null))
      )
    );
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

/** The top of the scale a log row's badge uses (1, 10 or 100). Logs don't
 *  record a score's range, so it is guessed from the largest sample score of
 *  the log's task and scorer, else from the shown value; null when no scale
 *  fits. */
export const shownScale = (
  row: LogListRow,
  index: SampleIndex
): number | null => {
  const value = shownScore(row, index);
  if (value === undefined) return null;
  return index.stats.get(logKey(row))?.top ?? scaleTop([value]);
};

export type ScaleGroup = number | "other" | "none";

export const scaleGroup = (row: LogListRow, index: SampleIndex): ScaleGroup =>
  shownScore(row, index) === undefined
    ? "none"
    : (shownScale(row, index) ?? "other");

const groupRank = (group: ScaleGroup): number =>
  typeof group === "number"
    ? group
    : group === "other"
      ? Number.MAX_VALUE
      : Infinity;

/** Rows already sorted by score, split by scale so a 0–10 log never sorts
 *  among 0–100 ones: 0–1, 0–10, 0–100, other scales, then no score. Each
 *  group keeps the order it had. */
export const groupByScale = <T>(
  rows: readonly T[],
  groupOf: (row: T) => ScaleGroup
): { group: ScaleGroup; rows: T[] }[] => {
  const groups = new Map<ScaleGroup, T[]>();
  for (const row of rows) {
    const group = groupOf(row);
    const list = groups.get(group) ?? [];
    list.push(row);
    groups.set(group, list);
  }
  return [...groups]
    .map(([group, list]) => ({ group, rows: list }))
    .sort((a, b) => groupRank(a.group) - groupRank(b.group));
};

export const scaleGroupLabel = (group: ScaleGroup): string =>
  typeof group === "number"
    ? `scores 0–${group}`
    : group === "other"
      ? "scores below 0 or above 100"
      : "no score";

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
