import { isProUxEnabled } from "./enabled";

/** The selected card, as a selector that survives the virtual list
 *  remounting it. `eventId` is set for a transcript event's card. */
export interface CardSelection {
  selector: string;
  eventId?: string;
}

const kEventCard = '[id^="event-panel-"]';
const kMessage = "[data-message-id]";
const kCard = '[class*="_card_"]';
const kControl =
  'a, button, input, select, textarea, label, summary, [role="button"], [role="tab"], [role="link"], [role="menuitem"], [role="checkbox"], [contenteditable], .cm-editor';
/** A click this far from where the press began was a drag, e.g. selecting
 *  text. */
const kDragPx = 4;

const quote = (value: string): string => `"${CSS.escape(value)}"`;

export const eventCardSelection = (eventId: string): CardSelection => ({
  selector: `[id=${quote(`event-panel-${eventId}`)}]`,
  eventId,
});

let nextKey = 0;
const tagged = (el: Element): string => {
  let key = el.getAttribute("data-pro-select");
  if (!key) {
    key = String(++nextKey);
    el.setAttribute("data-pro-select", key);
  }
  return `[data-pro-select=${quote(key)}]`;
};

/** What a click on `target` selects: the transcript event's card around it,
 *  else the message box, else any other card. */
export const selectionAt = (target: Element): CardSelection | null => {
  const event = target.closest(kEventCard);
  if (event) return eventCardSelection(event.id.slice("event-panel-".length));
  const message = target.closest(kMessage);
  const box = message?.parentElement;
  if (message && box) {
    const id = message.getAttribute("data-message-id");
    return {
      selector: id
        ? `[class*="_container_"]:has(> [data-message-id=${quote(id)}])`
        : tagged(box),
    };
  }
  const card = target.closest(kCard);
  if (card)
    return { selector: card.id ? `[id=${quote(card.id)}]` : tagged(card) };
  return null;
};

export const selectionRule = (selection: CardSelection | null): string =>
  selection
    ? `:root[data-pro-ux] ${selection.selector} { box-shadow: 0 0 0 2px var(--pro-dark); }`
    : "";

let current: CardSelection | null = null;
let style: HTMLStyleElement | null = null;
const listeners = new Set<(selection: CardSelection | null) => void>();

const show = (selection: CardSelection | null): void => {
  current = selection;
  if (!style) {
    style = document.createElement("style");
    style.id = "pro-card-select";
    document.head.appendChild(style);
  }
  style.textContent = selectionRule(selection);
};

const choose = (selection: CardSelection | null): void => {
  if (selection?.selector === current?.selector) return;
  show(selection);
  for (const listener of listeners) listener(selection);
};

/** Outline the event's card without telling listeners: the selection came
 *  from them (the outline, the address bar, j and k). */
export const showEventCard = (eventId: string | null): void => {
  const next = eventId ? eventCardSelection(eventId) : null;
  if (next?.selector !== current?.selector) show(next);
};

export const onCardSelect = (
  listener: (selection: CardSelection | null) => void
): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** For Esc: true when something was selected. */
export const clearCardSelection = (): boolean => {
  if (!current) return false;
  choose(null);
  return true;
};

export const installCardSelect = (): void => {
  let down = { x: 0, y: 0, url: "" };
  document.addEventListener(
    "pointerdown",
    (e) => {
      down = { x: e.clientX, y: e.clientY, url: window.location.href };
    },
    true
  );
  document.addEventListener("click", (e) => {
    if (!isProUxEnabled() || e.button !== 0 || e.detail > 1) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > kDragPx) return;
    if (window.getSelection()?.isCollapsed === false) return;
    const target = e.target instanceof Element ? e.target : null;
    if (!target?.isConnected || target.closest(kControl)) return;
    const selection = selectionAt(target);
    const url = down.url;
    // A click that navigated (a time-bar span, a sample row) leaves the
    // selection to where it went.
    window.setTimeout(() => {
      if (window.location.href === url) choose(selection);
    }, 0);
  });
};
