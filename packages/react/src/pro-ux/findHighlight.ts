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

/** Every rendered occurrence of `term` under `root`, in document order. */
export const textMatches = (root: Node, term: string): Range[] => {
  if (!term) return [];
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
  return findInChunks(
    nodes.map((n) => n.data),
    term
  ).flatMap(({ start, end }) => {
    const from = nodes[start[0]];
    const to = nodes[end[0]];
    if (!from || !to) return [];
    const range = document.createRange();
    range.setStart(from, start[1]);
    range.setEnd(to, end[1]);
    return [range];
  });
};

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
