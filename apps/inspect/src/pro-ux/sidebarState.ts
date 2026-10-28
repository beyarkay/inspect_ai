const kPinKey = "pro-ux-sidebar-pinned";

const read = (): boolean => {
  try {
    return localStorage.getItem(kPinKey) === "1";
  } catch {
    return false;
  }
};

let pinned = read();
const listeners = new Set<() => void>();

const apply = (): void => {
  document.documentElement.toggleAttribute("data-pro-sidebar-pinned", pinned);
};

export const isSidebarPinned = (): boolean => pinned;

export const setSidebarPinned = (next: boolean): void => {
  pinned = next;
  try {
    localStorage.setItem(kPinKey, next ? "1" : "0");
  } catch {
    // Storage unavailable: the pin lasts for this page only.
  }
  apply();
  for (const listener of listeners) listener();
};

export const toggleSidebarPinned = (): void => setSidebarPinned(!pinned);

export const subscribeSidebar = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

if (typeof document !== "undefined") apply();
