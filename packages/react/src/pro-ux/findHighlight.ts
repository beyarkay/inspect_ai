import "./find.css";

import { findInChunks } from "./textFind";

/** Text that find skips: its own band, the sample sidebar (it has its own
 *  filter), form fields and anything marked unsearchable. */
const kSkip =
  "[data-unsearchable], .pro-sidebar, script, style, noscript, textarea, input, select";

export const highlightSupported = (): boolean =>
  typeof CSS !== "undefined" &&
  "highlights" in CSS &&
  typeof Highlight === "function";

/** The tallest scrolling ancestor: the page's main scroller, not a code
 *  block or panel that scrolls inside it. */
export const scrollerOf = (node: Node | null): HTMLElement => {
  let best: HTMLElement = document.documentElement;
  let el = node instanceof Element ? node : (node?.parentElement ?? null);
  for (; el && el !== document.body; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      el.scrollHeight > el.clientHeight + 1 &&
      el instanceof HTMLElement &&
      (best === document.documentElement || el.clientHeight > best.clientHeight)
    ) {
      best = el;
    }
  }
  return best;
};

export interface TextMatch {
  range: Range;
  /** Rendered text just before and after the match. */
  before: string;
  after: string;
}

/** Every rendered occurrence of `pattern` under `root`, in document order,
 *  with `radius` characters of text either side. */
export const textMatchesIn = (
  root: Node,
  pattern: string | RegExp,
  radius = 0
): TextMatch[] => {
  if (!pattern) return [];
  const skipped = new Map<Element, boolean>();
  const skip = (el: Element): boolean => {
    let hit = skipped.get(el);
    if (hit === undefined) {
      hit =
        el.closest(kSkip) !== null ||
        el.getClientRects().length === 0 ||
        getComputedStyle(el).userSelect === "none";
      skipped.set(el, hit);
    }
    return hit;
  };
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.nodeValue && node.parentElement && !skip(node.parentElement)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT,
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node instanceof Text) nodes.push(node);
  }
  const texts = nodes.map((n) => n.data);
  const joined = radius > 0 ? texts.join("") : "";
  return findInChunks(texts, pattern).flatMap(({ start, end, from, to }) => {
    const first = nodes[start[0]];
    const last = nodes[end[0]];
    if (!first || !last) return [];
    const range = document.createRange();
    range.setStart(first, start[1]);
    range.setEnd(last, end[1]);
    return [
      {
        range,
        before: joined.slice(Math.max(0, from - radius), from),
        after: joined.slice(to, to + radius),
      },
    ];
  });
};

/** Every rendered occurrence of `term` under `root`, in document order. */
export const textMatches = (root: Node, term: string): Range[] =>
  textMatchesIn(root, term).map((m) => m.range);

/** Paints matches with the CSS highlight API, so they show whatever the
 *  browser does with the selection (Firefox hides it while the find box has
 *  focus): every match pale under `name`, the current one strong under
 *  `name-current`. */
export const createMarker = (name: string) => ({
  paint: (all: Range[], current: Range | null): void => {
    if (!highlightSupported()) return;
    CSS.highlights.set(name, new Highlight(...all));
    if (current) CSS.highlights.set(`${name}-current`, new Highlight(current));
    else CSS.highlights.delete(`${name}-current`);
  },
  clear: (): void => {
    if (!highlightSupported()) return;
    CSS.highlights.delete(name);
    CSS.highlights.delete(`${name}-current`);
  },
});
