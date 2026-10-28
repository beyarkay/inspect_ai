import { MouseEvent, useCallback, useRef } from "react";

import {
  createMarker,
  scrollerOf,
  textMatchesIn,
  useFindTargetSetter,
} from "@tsmono/react/components";
import { useUnmount } from "@tsmono/react/hooks";

import { scrollTranscriptToEvent } from "./barJump";
import { eventRow, settleLanding } from "./landing";
import { useHtmlFlag } from "./useHtmlFlag";

/** A grep result line: the matched text and what the server showed around
 *  it. */
export interface Snippet {
  before: string;
  match: string;
  after: string;
}

/** Splits a result line's pieces (after its citation link) at the bold
 *  match. */
export const snippetFrom = (
  pieces: readonly { text: string; strong: boolean }[]
): Snippet => {
  const snippet: Snippet = { before: "", match: "", after: "" };
  for (const piece of pieces) {
    if (piece.strong && !snippet.match) snippet.match = piece.text;
    else if (snippet.match) snippet.after += piece.text;
    else snippet.before += piece.text;
  }
  return snippet;
};

/** Letters and digits only: the server quotes raw text (JSON escapes,
 *  collapsed whitespace) while the page shows it rendered. */
const key = (text: string): string =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, "");

const sharedPrefix = (a: string, b: string): number => {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
};

const sharedSuffix = (a: string, b: string): number => {
  let n = 0;
  while (
    n < a.length &&
    n < b.length &&
    a[a.length - 1 - n] === b[b.length - 1 - n]
  ) {
    n++;
  }
  return n;
};

/** Which rendered match a result line means: the one whose surrounding text
 *  agrees longest with the line's, ties going to the one nearest the
 *  line's place among that event's results. -1 when there is none. */
export const pickMatch = (
  snippet: Snippet,
  candidates: readonly { before: string; after: string }[],
  ordinal: number
): number => {
  const before = key(snippet.before);
  const after = key(snippet.after);
  let best = -1;
  let bestScore = -1;
  candidates.forEach((candidate, i) => {
    const score =
      sharedSuffix(key(candidate.before), before) +
      sharedPrefix(key(candidate.after), after);
    const closer =
      best !== -1 && Math.abs(i - ordinal) < Math.abs(best - ordinal);
    if (score > bestScore || (score === bestScore && closer)) {
      best = i;
      bestScore = score;
    }
  });
  return best;
};

/** The pieces of the result line after `link`, up to its line break. */
const snippetOf = (link: Element): Snippet => {
  const pieces: { text: string; strong: boolean }[] = [];
  for (let node = link.nextSibling; node; node = node.nextSibling) {
    if (node instanceof HTMLBRElement) break;
    pieces.push({
      text: node.textContent ?? "",
      strong: node instanceof HTMLElement && node.tagName === "STRONG",
    });
  }
  return snippetFrom(pieces);
};

/** How many earlier result lines cite the same event. */
const ordinalOf = (link: Element, card: Element): number => {
  const ref = link.getAttribute("href");
  let n = 0;
  for (const other of card.querySelectorAll("a[href]")) {
    if (other === link) break;
    if (other.getAttribute("href") === ref) n++;
  }
  return n;
};

const marker = createMarker("pro-grep");

/** Once the event's row is rendered and the scroll has settled (a changed
 *  URL scrolls the row to the top first), land the match midway down the
 *  clear space and paint it. */
const landOnMatch = (
  eventId: string,
  snippet: Snippet,
  ordinal: number
): (() => void) => {
  let frame = 0;
  let waited = 0;
  let still = 0;
  let lastTop = Number.NaN;
  let stopLanding: (() => void) | null = null;
  const wait = () => {
    const found = document.querySelector<HTMLElement>(
      `[id="${CSS.escape(eventId)}"]`
    );
    const top = found ? scrollerOf(found).scrollTop : Number.NaN;
    still = found && Math.abs(top - lastTop) < 1 ? still + 1 : 0;
    lastTop = top;
    if (still < 6 && waited++ < 180) {
      frame = requestAnimationFrame(wait);
      return;
    }
    if (!found) return;
    const scroller = scrollerOf(found);
    const matches = textMatchesIn(found, snippet.match, 80);
    const target = matches[pickMatch(snippet, matches, ordinal)]?.range ?? null;
    marker.paint(
      matches.map((m) => m.range),
      target
    );
    stopLanding = settleLanding(scroller, () => {
      const row = eventRow(scroller, eventId);
      if (!row) return null;
      return target?.startContainer.isConnected
        ? { row, target, mode: "center" }
        : { row, target: null, mode: "header" };
    });
  };
  frame = requestAnimationFrame(wait);
  return () => {
    cancelAnimationFrame(frame);
    stopLanding?.();
  };
};

/** Pro-UX: clicking a grep result lands the clicked match, not the top of
 *  its event, and paints it; clicking another result in the same event
 *  moves to that match instead of doing nothing. */
export const useGrepResultJump = (): ((e: MouseEvent<HTMLElement>) => void) => {
  const enabled = useHtmlFlag("data-pro-ux");
  const setFindTarget = useFindTargetSetter();
  const stopRef = useRef<(() => void) | null>(null);
  useUnmount(() => {
    stopRef.current?.();
    marker.clear();
  });

  return useCallback(
    (e: MouseEvent<HTMLElement>) => {
      if (!enabled || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link =
        e.target instanceof Element ? e.target.closest("a[href]") : null;
      const href = link?.getAttribute("href");
      if (!link || !href) return;
      const eventId = new URLSearchParams(href.split("?")[1] ?? "").get(
        "event"
      );
      const snippet = snippetOf(link);
      if (!eventId || !snippet.match) return;
      const ordinal = ordinalOf(link, e.currentTarget);
      stopRef.current?.();
      if (window.location.hash === href) {
        e.preventDefault();
        if (!document.querySelector(`[id="${CSS.escape(eventId)}"]`)) {
          scrollTranscriptToEvent(eventId);
        }
      }
      setFindTarget({ term: snippet.match, eventId });
      stopRef.current = landOnMatch(eventId, snippet, ordinal);
    },
    [enabled, setFindTarget]
  );
};
