/** A match across consecutive text chunks: [chunk index, offset] at each end,
 *  the end exclusive. */
export interface ChunkMatch {
  start: [number, number];
  end: [number, number];
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

/** Every case-insensitive occurrence of `term` in the chunks read as one
 *  text, so a match may cross element boundaries (syntax-highlighted code
 *  splits words into spans). Empty chunks are not allowed. */
export const findInChunks = (
  chunks: readonly string[],
  term: string
): ChunkMatch[] => {
  if (!term || chunks.length === 0) return [];
  const starts: number[] = [];
  let joined = "";
  for (const chunk of chunks) {
    starts.push(joined.length);
    joined += chunk;
  }
  const matches: ChunkMatch[] = [];
  for (const found of joined.matchAll(new RegExp(escapeRegExp(term), "gi"))) {
    const from = found.index;
    const to = from + found[0].length;
    matches.push({
      start: locate(starts, from, false),
      end: locate(starts, to, true),
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
