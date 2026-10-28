/** A match across consecutive text chunks: [chunk index, offset] at each end,
 *  the end exclusive, and its span in the joined text. */
export interface ChunkMatch {
  start: [number, number];
  end: [number, number];
  from: number;
  to: number;
}

const escapeRegExp = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Chunk holding character `at` of the joined text; `atEnd` places a match
 *  end on the chunk it closes, not the next one. */
const locate = (
  starts: readonly number[],
  at: number,
  atEnd: boolean
): [number, number] => {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const start = starts[mid] ?? 0;
    if (atEnd ? start < at : start <= at) lo = mid;
    else hi = mid - 1;
  }
  return [lo, at - (starts[lo] ?? 0)];
};

/** Every occurrence of `pattern` (text, matched ignoring case, or a regular
 *  expression) in the chunks read as one text, so a match may cross element
 *  boundaries (syntax-highlighted code splits words into spans). Empty
 *  chunks are not allowed; empty matches are skipped. */
export const findInChunks = (
  chunks: readonly string[],
  pattern: string | RegExp
): ChunkMatch[] => {
  if (!pattern || chunks.length === 0) return [];
  const regex =
    typeof pattern === "string"
      ? new RegExp(escapeRegExp(pattern), "gi")
      : new RegExp(
          pattern.source,
          pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`
        );
  const starts: number[] = [];
  let joined = "";
  for (const chunk of chunks) {
    starts.push(joined.length);
    joined += chunk;
  }
  const matches: ChunkMatch[] = [];
  for (const found of joined.matchAll(regex)) {
    const from = found.index;
    const to = from + found[0].length;
    if (to === from) continue;
    matches.push({
      start: locate(starts, from, false),
      end: locate(starts, to, true),
      from,
      to,
    });
  }
  return matches;
};

/** The match a find step lands on, or -1. `compare(i)` places match i
 *  against the reference: negative before, 0 on it, positive after. Forward
 *  takes the first match after; back the last before. `inclusive` also
 *  accepts a match on the reference. */
export const stepIndex = (
  count: number,
  compare: (i: number) => number,
  back: boolean,
  inclusive = false
): number => {
  if (back) {
    for (let i = count - 1; i >= 0; i--) {
      const c = compare(i);
      if (c < 0 || (inclusive && c === 0)) return i;
    }
    return -1;
  }
  for (let i = 0; i < count; i++) {
    const c = compare(i);
    if (c > 0 || (inclusive && c === 0)) return i;
  }
  return -1;
};
