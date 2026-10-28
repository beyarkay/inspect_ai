import "./fonts.css";
import "./pro-ux.css";

import { installSmallCaps } from "./smallCaps";

const kStorageKey = "pro-ux-enabled";

const readEnabled = (): boolean => {
  try {
    return localStorage.getItem(kStorageKey) !== "0";
  } catch {
    return true;
  }
};

export const setProUxEnabled = (enabled: boolean): void => {
  document.documentElement.toggleAttribute("data-pro-ux", enabled);
  try {
    localStorage.setItem(kStorageKey, enabled ? "1" : "0");
  } catch {
    // Private window or blocked storage: the toggle still works for this page.
  }
};

export const isProUxEnabled = (): boolean =>
  document.documentElement.hasAttribute("data-pro-ux");

setProUxEnabled(readEnabled());
installSmallCaps();
