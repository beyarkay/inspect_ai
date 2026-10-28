import { RefObject, useCallback, useEffect, useMemo, useRef } from "react";

import { useLatestRef, useUnmount } from "@tsmono/react/hooks";

import type { TranscriptViewNodesHandle } from "../transcript/TranscriptViewNodes";
import type { EventNode } from "../transcript/types";

import type { SpanTarget } from "./kindSpans";
import { eventRow, settleLanding } from "./landing";

/** The block after `el` inside `within`, climbing until one exists. */
const followingBlock = (within: Element, el: Element): HTMLElement | null => {
  for (let at: Element | null = el; at && at !== within;) {
    const next = at.nextElementSibling;
    if (next instanceof HTMLElement) return next;
    at = at.parentElement;
  }
  return null;
};

/** The element a span stands for inside its event row: a prompt message, or
 *  the reply's reasoning or its answer after the reasoning. Null lands the
 *  row's header. */
export const spanTargetIn = (
  row: HTMLElement,
  target?: SpanTarget
): HTMLElement | null => {
  if (!target?.messageId) return null;
  const message = row.querySelector<HTMLElement>(
    `[data-message-id="${CSS.escape(target.messageId)}"]`
  );
  if (!message || !target.part) return message;
  const reasoning = message.querySelectorAll<HTMLElement>(
    '[data-content-kind="reasoning"]'
  );
  if (target.part === "reasoning") return reasoning[0] ?? message;
  const last = reasoning[reasoning.length - 1];
  const answer = last ? followingBlock(message, last) : null;
  return answer && !answer.matches('[class*="_metadataLabel_"]')
    ? answer
    : message;
};

interface BarJumpOptions {
  turns: EventNode[];
  eventsListRef?: RefObject<TranscriptViewNodesHandle | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
  /** The `?event=` the layout was rendered with. */
  urlEventId?: string | null;
  onNavigatedToEvent?: (eventId: string) => void;
  onHeadroomSetHidden?: (hidden: boolean) => void;
  onHeadroomResetAnchor?: (debounce?: boolean) => void;
}

/** Time-bar clicks: land the clicked message (or the event's header) below
 *  the sticky chrome, and record the event in the URL without the list
 *  scrolling the row to its top again.
 *
 *  The landing starts once the URL change has rendered: collapsing the
 *  chrome before then re-renders the list with the old `?event=`, which
 *  clears its "already there" mark and the late URL render re-scrolls. */
export const useBarJump = ({
  turns,
  eventsListRef,
  scrollRef,
  urlEventId,
  onNavigatedToEvent,
  onHeadroomSetHidden,
  onHeadroomResetAnchor,
}: BarJumpOptions) => {
  const stopRef = useRef<(() => void) | null>(null);
  const pendingRef = useRef<{ eventId: string; land: () => void } | null>(null);
  const urlEventRef = useLatestRef(urlEventId);
  useUnmount(() => stopRef.current?.());

  const onSelect = useCallback(
    (eventId: string, target?: SpanTarget) => {
      stopRef.current?.();
      const list = eventsListRef?.current;
      const land = () => {
        const scroller = scrollRef.current;
        list?.markNavigated?.(eventId);
        onHeadroomResetAnchor?.(true);
        onHeadroomSetHidden?.(true);
        if (!scroller) return;
        if (!eventRow(scroller, eventId)) list?.scrollToEvent(eventId);
        stopRef.current = settleLanding(scroller, () => {
          const row = eventRow(scroller, eventId);
          if (!row) return null;
          const inside = spanTargetIn(row, target);
          return inside
            ? { row, target: inside, mode: "top" }
            : { row, target: null, mode: "header" };
        });
      };
      if (!onNavigatedToEvent || urlEventRef.current === eventId) {
        land();
        return;
      }
      list?.markNavigated?.(eventId);
      pendingRef.current = { eventId, land };
      onNavigatedToEvent(eventId);
      const fallback = window.setTimeout(() => {
        if (pendingRef.current?.eventId !== eventId) return;
        pendingRef.current = null;
        land();
      }, 400);
      stopRef.current = () => {
        window.clearTimeout(fallback);
        pendingRef.current = null;
      };
    },
    [
      scrollRef,
      eventsListRef,
      urlEventRef,
      onNavigatedToEvent,
      onHeadroomSetHidden,
      onHeadroomResetAnchor,
    ]
  );

  // eslint-disable-next-line tsmono/no-raw-use-effect -- starts a pending landing once the URL change has rendered
  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending || urlEventId !== pending.eventId) return;
    pendingRef.current = null;
    pending.land();
  }, [urlEventId]);

  return useMemo(() => ({ turns, onSelect }), [turns, onSelect]);
};
