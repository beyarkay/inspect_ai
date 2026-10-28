import {
  createMarker,
  highlightSupported,
  scrollerOf,
  textMatches,
} from "./findHighlight";
import { stepIndex } from "./textFind";

/** Pro-UX Cmd-F: steps through rendered matches in document order and
 *  paints them, instead of `window.find`. Firefox's `window.find` matches
 *  the find box's own text once focus returns to it, so Enter alternated
 *  between the box and one page match, and it never paints the selection
 *  while the box has focus. Past the last rendered match it scrolls on a
 *  screen at a time, so a virtual list renders the rows beyond, and wraps
 *  at the end. */
export const proFindEnabled = (): boolean =>
  typeof document !== "undefined" &&
  document.documentElement.hasAttribute("data-pro-ux") &&
  highlightSupported();

const kMaxScanSteps = 200;

const marker = createMarker("pro-find");
let term = "";
let current: Range | null = null;
let generation = 0;
let observer: MutationObserver | null = null;
let repaintTimer = 0;
let collapseTimer = 0;

const live = (range: Range | null): range is Range =>
  !!range && !range.collapsed && range.startContainer.isConnected;

const same = (a: Range, b: Range): boolean =>
  a.compareBoundaryPoints(Range.START_TO_START, b) === 0 &&
  a.compareBoundaryPoints(Range.END_TO_END, b) === 0;

const collect = (): Range[] => textMatches(document.body, term);

/** The page selection, or null when it sits in the find band or a field. */
const pageSelection = (): Range | null => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const node = range.startContainer;
  const host = node instanceof Element ? node : node.parentElement;
  if (!host || host.closest("[data-unsearchable], input, textarea")) {
    return null;
  }
  return range;
};

/** The scroller of `node`, else the one under the middle of the window. */
const scrollerNear = (node: Node | null): HTMLElement =>
  scrollerOf(
    node ??
      document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)
  );

/** A range's top in its scroller's content, which stays comparable after a
 *  virtual list unrenders the row. */
const contentTop = (scroller: HTMLElement, range: Range): number =>
  range.getBoundingClientRect().top -
  scroller.getBoundingClientRect().top +
  scroller.scrollTop;

const frames = (count: number): Promise<void> =>
  new Promise((resolve) => {
    const step = (left: number) => {
      if (left <= 0) resolve();
      else requestAnimationFrame(() => step(left - 1));
    };
    step(count);
  });

/** Rows render and unrender as the list scrolls; keep the paint current. */
const watch = (): void => {
  if (observer) return;
  observer = new MutationObserver(() => {
    if (repaintTimer) return;
    repaintTimer = window.setTimeout(() => {
      repaintTimer = 0;
      if (term) marker.paint(collect(), live(current) ? current : null);
    }, 150);
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
};

/** FindBand reads the match from the selection, so it is selected; once it
 *  has, it is collapsed so the native selection colour does not cover the
 *  painted one. */
const select = (range: Range): void => {
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range.cloneRange());
  window.clearTimeout(collapseTimer);
  collapseTimer = window.setTimeout(() => {
    const now = window.getSelection();
    if (now?.rangeCount && live(current) && same(now.getRangeAt(0), current)) {
      now.collapseToEnd();
    }
  }, 160);
};

/** Find the next (or previous) match of `text`, select it and paint every
 *  match. `offscreen` says whether unrendered rows may hold matches (the
 *  search sources' count); without it the scan stays in the rendered page.
 *  Resolves false when there is none, or a newer search took over. */
export const proFind = async (
  text: string,
  back: boolean,
  offscreen: boolean
): Promise<boolean> => {
  const mine = ++generation;
  const fresh = text !== term || !live(current);
  const anchor = fresh ? pageSelection() : current;
  term = text;
  if (fresh) current = null;

  let matches = collect();
  const scroller = scrollerNear(
    anchor?.startContainer ?? matches[0]?.startContainer ?? null
  );
  const anchorTop = anchor
    ? contentTop(scroller, anchor)
    : scroller.scrollTop + (back ? scroller.clientHeight : 0);
  const order = (i: number): number => {
    const match = matches[i];
    if (!match) return 0;
    if (anchor?.startContainer.isConnected) {
      return match.compareBoundaryPoints(Range.START_TO_START, anchor);
    }
    return Math.sign(contentTop(scroller, match) - anchorTop);
  };

  const startTop = scroller.scrollTop;
  let pick = stepIndex(matches.length, order, back, fresh);
  for (let step = 0; offscreen && pick === -1 && step < kMaxScanSteps; step++) {
    const before = scroller.scrollTop;
    const stride = Math.max(100, scroller.clientHeight - 60);
    scroller.scrollTop = before + (back ? -stride : stride);
    if (Math.abs(scroller.scrollTop - before) < 1) break;
    await frames(3);
    if (mine !== generation) return false;
    matches = collect();
    pick = stepIndex(matches.length, order, back, fresh);
  }
  if (pick === -1 && offscreen) {
    scroller.scrollTop = back ? scroller.scrollHeight : 0;
    await frames(3);
    if (mine !== generation) return false;
    matches = collect();
  }
  if (pick === -1) {
    pick = matches.length === 0 ? -1 : back ? matches.length - 1 : 0;
  }

  const range = matches[pick];
  if (!range) {
    scroller.scrollTop = startTop;
    current = null;
    marker.paint(matches, null);
    return false;
  }
  current = range;
  select(range);
  marker.paint(matches, range);
  watch();
  return true;
};

export const clearProFind = (): void => {
  generation++;
  term = "";
  current = null;
  observer?.disconnect();
  observer = null;
  window.clearTimeout(repaintTimer);
  window.clearTimeout(collapseTimer);
  repaintTimer = 0;
  marker.clear();
};
