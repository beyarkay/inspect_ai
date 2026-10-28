/** The user's explicit dock choice; null means automatic: docked while a
 *  sample is open in a wide window, floating otherwise. */
export type DockChoice = "docked" | "floating" | null;

const kChoiceKey = "pro-ux-sidebar-choice";

/** Wide enough for the 300px sample list beside a readable transcript. */
export const kWideQuery = "(min-width: 1200px)";

const read = (): DockChoice => {
  try {
    const stored = localStorage.getItem(kChoiceKey);
    return stored === "docked" || stored === "floating" ? stored : null;
  } catch {
    return null;
  }
};

let choice = read();
const listeners = new Set<() => void>();

export const getDockChoice = (): DockChoice => choice;

export const setDockChoice = (next: DockChoice): void => {
  choice = next;
  try {
    if (next === null) localStorage.removeItem(kChoiceKey);
    else localStorage.setItem(kChoiceKey, next);
  } catch {
    // Storage unavailable: the choice lasts for this page only.
  }
  for (const listener of listeners) listener();
};

export const resolveDocked = (
  choice: DockChoice,
  autoDock: boolean
): boolean => (choice === null ? autoDock : choice === "docked");

/** Flip whatever is on screen now, automatic or not. */
export const toggleSidebarDocked = (): void =>
  setDockChoice(
    document.querySelector(".pro-sidebar[data-docked]") ? "floating" : "docked"
  );

export const subscribeSidebar = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const subscribeWide = (listener: () => void): (() => void) => {
  const query = window.matchMedia(kWideQuery);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
};

export const isWide = (): boolean => window.matchMedia(kWideQuery).matches;
