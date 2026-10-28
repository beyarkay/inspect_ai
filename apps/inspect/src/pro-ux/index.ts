import "./fonts.css";
import "./pro-ux.css";
import "./dark.css";
import "./content.css";
import "./trajectory.css";
import "./search.css";

import { installCells } from "./cells";
import { isProUxEnabled } from "./enabled";
import { closeHelp, installHelp, toggleHelp } from "./help";
import { announceSkin, installKeys, setKeyActions } from "./keys";
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

export { isProUxEnabled };

setProUxEnabled(readEnabled());
installSmallCaps();

setKeyActions({
  toggleHelp,
  closeHelp,
  toggleSkin: () => {
    setProUxEnabled(!isProUxEnabled());
    announceSkin(isProUxEnabled());
  },
});

installKeys();
installHelp();
installCells();
