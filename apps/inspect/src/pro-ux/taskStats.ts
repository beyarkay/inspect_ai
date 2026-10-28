import { scaleTop } from "./cells";

const kLetterScores: Record<string, number> = { C: 1, P: 0.5, I: 0, N: 0 };

/** A sample's score as a number, or null when it isn't one. */
export const numericScore = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string") {
    const letter = kLetterScores[value.trim()];
    if (letter !== undefined) return letter;
    const n = Number(value);
    return value.trim() !== "" && Number.isFinite(n) ? n : null;
  }
  return null;
};

/** The first score in a sample's score map that reads as a number. */
export const firstNumericScore = (
  scores: Record<string, unknown> | undefined
): number | null => {
  for (const value of Object.values(scores ?? {})) {
    const n = numericScore(value);
    if (n !== null) return n;
  }
  return null;
};

export interface ScoreStats {
  n: number;
  mean: number;
  /** Top of the inferred scale (1, 10 or 100); null when none fits. */
  top: number | null;
  /** Sample counts per equal-width bin over [0, top]. */
  bins: number[];
}

export const kHistogramBins = 10;

export const scoreStats = (
  values: number[],
  binCount = kHistogramBins
): ScoreStats | null => {
  if (values.length === 0) return null;
  const top = scaleTop(values);
  const bins = new Array<number>(binCount).fill(0);
  if (top !== null) {
    for (const v of values) {
      const i = Math.min(
        binCount - 1,
        Math.max(0, Math.floor((v / top) * binCount))
      );
      bins[i] = (bins[i] ?? 0) + 1;
    }
  }
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return { n: values.length, mean, top, bins };
};

/** Largest share of one row's samples in a single bin, over all rows: the
 *  common y range for every row's histogram. */
export const maxBinShare = (stats: Iterable<ScoreStats | null>): number => {
  let max = 0;
  for (const s of stats) {
    if (!s || s.n === 0) continue;
    for (const count of s.bins) max = Math.max(max, count / s.n);
  }
  return max;
};

export const binLabel = (stats: ScoreStats, i: number): string => {
  if (stats.top === null) return "";
  const width = stats.top / stats.bins.length;
  const lo = i * width;
  const hi = lo + width;
  const fmt = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(2));
  return `${fmt(lo)}–${fmt(hi)}`;
};

export const statsHint = (stats: ScoreStats, fromSamples: boolean): string => {
  const lines = [
    `${fromSamples ? "mean of sample scores" : "headline metric"}; histogram of ${stats.n} sample score${stats.n === 1 ? "" : "s"}`,
    `n = ${stats.n} · mean = ${stats.mean.toFixed(3)}${stats.top !== null ? ` · scale 0–${stats.top}` : ""}`,
  ];
  if (stats.top !== null) {
    lines.push(
      stats.bins.map((count, i) => `${binLabel(stats, i)}: ${count}`).join("\n")
    );
  }
  return lines.join("\n");
};

/** Task args as one line: `key value · key value`, values shortened. */
export const argsSummary = (
  args: Record<string, unknown>
): { key: string; value: string }[] =>
  Object.entries(args).map(([key, value]) => ({
    key,
    value: shortValue(value),
  }));

const shortValue = (value: unknown): string => {
  if (typeof value === "string") {
    const parsed = parseJsonish(value);
    if (parsed !== undefined && typeof parsed === "object" && parsed !== null)
      return braces(parsed);
    return value;
  }
  if (value !== null && typeof value === "object") return braces(value);
  return String(value);
};

const braces = (value: object): string =>
  Array.isArray(value)
    ? `[${value.length}]`
    : `{${Object.keys(value).join(", ")}}`;

/** A string that holds a JSON object or array, parsed; otherwise undefined. */
export const parseJsonish = (text: string): unknown => {
  const t = text.trim();
  if (!(t.startsWith("{") || t.startsWith("["))) return undefined;
  try {
    return JSON.parse(t) as unknown;
  } catch {
    return undefined;
  }
};

/** An arg's value laid out for reading: nested JSON pretty-printed. */
export const argsDetail = (value: unknown): string => {
  if (typeof value === "string") {
    const parsed = parseJsonish(value);
    return parsed === undefined ? value : JSON.stringify(parsed, null, 2);
  }
  if (value !== null && typeof value === "object")
    return JSON.stringify(value, null, 2);
  return String(value);
};

/** A value with as many decimals as its scale warrants: 0–100 → one,
 *  0–10 → two, 0–1 → three. */
export const formatOnScale = (value: number, top: number | null): string => {
  if (Number.isInteger(value)) return String(value);
  const digits = top === 100 ? 1 : top === 10 ? 2 : 3;
  return value.toFixed(digits);
};
