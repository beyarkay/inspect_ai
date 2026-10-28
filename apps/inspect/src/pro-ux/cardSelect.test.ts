// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearCardSelection,
  eventCardSelection,
  onCardSelect,
  selectionAt,
  selectionRule,
  showEventCard,
} from "./cardSelect";

const html = (markup: string): HTMLElement => {
  const root = document.createElement("div");
  root.innerHTML = markup;
  document.body.appendChild(root);
  return root;
};

afterEach(() => {
  document.body.innerHTML = "";
  showEventCard(null);
});

describe("selectionAt", () => {
  it("selects the event card around a message inside it", () => {
    const root = html(
      `<div id="event-panel-abc"><div class="_container_x"><div data-message-id="m1"><p>hi</p></div></div></div>`
    );
    const selection = selectionAt(root.querySelector("p")!);
    expect(selection).toEqual(eventCardSelection("abc"));
  });

  it("selects a message's box outside the transcript", () => {
    const root = html(
      `<div class="_container_x"><div data-message-id="m1"><p>hi</p></div></div>`
    );
    expect(selectionAt(root.querySelector("p")!)?.selector).toBe(
      '[class*="_container_"]:has(> [data-message-id="m1"])'
    );
  });

  it("tags a card with no id so it can be found again", () => {
    const root = html(`<div class="_card_q"><span>x</span></div>`);
    const selection = selectionAt(root.querySelector("span")!);
    expect(selection).not.toBeNull();
    expect(root.querySelector(selection!.selector)).toBe(
      root.querySelector("._card_q")
    );
  });

  it("selects nothing outside a card", () => {
    const root = html(`<main><p>x</p></main>`);
    expect(selectionAt(root.querySelector("p")!)).toBeNull();
  });
});

describe("selectionRule", () => {
  it("outlines only under the pro-UX skin", () => {
    expect(selectionRule(eventCardSelection("a b"))).toBe(
      ':root[data-pro-ux] [id="event-panel-a\\ b"] { box-shadow: 0 0 0 2px var(--pro-dark); }'
    );
    expect(selectionRule(null)).toBe("");
  });
});

describe("clearCardSelection", () => {
  it("reports whether there was a selection and tells listeners", () => {
    const listener = vi.fn();
    const stop = onCardSelect(listener);
    expect(clearCardSelection()).toBe(false);
    showEventCard("abc");
    expect(listener).not.toHaveBeenCalled();
    expect(clearCardSelection()).toBe(true);
    expect(listener).toHaveBeenCalledWith(null);
    stop();
  });
});
