export const isEditable = (el: Element | null): boolean => {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.closest(".cm-editor") !== null
  );
};

export const isVisible = (el: Element): boolean =>
  el.isConnected &&
  el.getClientRects().length > 0 &&
  getComputedStyle(el).visibility !== "hidden";

export const firstVisible = <T extends Element>(
  selector: string,
  root: ParentNode = document
): T | null => {
  for (const el of Array.from(root.querySelectorAll<T>(selector))) {
    if (isVisible(el)) return el;
  }
  return null;
};

export const allVisible = <T extends Element>(
  selector: string,
  root: ParentNode = document
): T[] => Array.from(root.querySelectorAll<T>(selector)).filter(isVisible);

/** The visible button-like control whose own text is exactly `label`. */
export const controlByText = (label: string): HTMLElement | null => {
  const wanted = label.toLowerCase();
  for (const el of allVisible<HTMLElement>("button, .btn, [role=button]")) {
    if (el.textContent.trim().toLowerCase() === wanted) return el;
  }
  return null;
};

export const overlayOpen = (): boolean =>
  firstVisible(
    "[role=dialog], .modal.show, .popover, .dropdown-menu.show, [role=menu]"
  ) !== null;

export const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  text?: string
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
};

/** Coalesce bursts of DOM mutations into one callback per frame. */
export const onDomSettled = (callback: () => void): void => {
  let pending = false;
  new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      callback();
    });
  }).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
};
