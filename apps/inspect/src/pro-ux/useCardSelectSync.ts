import type { RefObject } from "react";
import type { SetURLSearchParams } from "react-router";

import {
  useLatestRef,
  useMirrorToStore,
  useMountEffect,
  useUnmount,
} from "@tsmono/react/hooks";

import { onCardSelect, showEventCard } from "./cardSelect";

interface EventList {
  markNavigated?: (eventId: string) => void;
}

/** The selected event card is the address bar's `?event=`: clicking a card
 *  writes it without scrolling, Esc or a click elsewhere removes it, and an
 *  outline link, a deep link or j and k move the card's outline. */
export const useCardSelectSync = (
  eventId: string | null | undefined,
  list: RefObject<EventList | null>,
  onNavigatedToEvent: (eventId: string) => void,
  setSearchParams: SetURLSearchParams
): void => {
  useMirrorToStore(eventId ?? "", (id) => showEventCard(id || null));
  useUnmount(() => showEventCard(null));

  const latest = useLatestRef({ list, onNavigatedToEvent, setSearchParams });
  useMountEffect(() =>
    onCardSelect((selection) => {
      const s = latest.current;
      const selected = selection?.eventId;
      if (selected) {
        s.list.current?.markNavigated?.(selected);
        s.onNavigatedToEvent(selected);
        return;
      }
      s.setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("event");
          return next;
        },
        { replace: true }
      );
    })
  );
};
