import { useSyncExternalStore } from "react";

export interface ProPrefs {
  collapseEmptyColumns: boolean;
  wrapCells: boolean;
  hoverCard: boolean;
  scoreBadges: boolean;
  quantityUnderlines: boolean;
  printedKeys: boolean;
  detailedOutline: boolean;
  turnMarkers: boolean;
  smartScores: boolean;
}

export const kPrefDefaults: ProPrefs = {
  collapseEmptyColumns: true,
  wrapCells: false,
  hoverCard: true,
  scoreBadges: true,
  quantityUnderlines: true,
  printedKeys: true,
  detailedOutline: true,
  turnMarkers: true,
  smartScores: true,
};

export const kPrefKeys: (keyof ProPrefs)[] = [
  "collapseEmptyColumns",
  "wrapCells",
  "hoverCard",
  "scoreBadges",
  "quantityUnderlines",
  "printedKeys",
  "detailedOutline",
  "turnMarkers",
  "smartScores",
];

export const kPrefLabels: Record<keyof ProPrefs, [string, string]> = {
  collapseEmptyColumns: [
    "Collapse empty columns",
    "Columns with no values move to the end, 28px wide",
  ],
  wrapCells: [
    "Soft-wrap table cells",
    "Show whole cell contents; rows grow to fit",
  ],
  hoverCard: ["Hover card on sample rows", "Every field of the hovered row"],
  scoreBadges: ["Score badges", "Scores coloured on a purple–green scale"],
  quantityUnderlines: [
    "Underline tokens and durations",
    "Heat colour by value, log scale",
  ],
  printedKeys: ["Print keys on controls", "e.g. 1 Transcript, [ previous"],
  detailedOutline: [
    "Detailed transcript outline",
    "One row per model call and tool call",
  ],
  turnMarkers: ["Turn markers on the timeline", "A tick per model call"],
  smartScores: [
    "Structured score text",
    "JSON and XML shown as collapsible trees",
  ],
};

const kStorageKey = "pro-ux-prefs";

const read = (): ProPrefs => {
  try {
    const raw = localStorage.getItem(kStorageKey);
    if (!raw) return kPrefDefaults;
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return { ...kPrefDefaults, ...(parsed as Partial<ProPrefs>) };
    }
  } catch {
    // Unreadable storage: fall back to defaults.
  }
  return kPrefDefaults;
};

let current = read();
const listeners = new Set<() => void>();

const applyToDocument = (): void => {
  const root = document.documentElement;
  for (const [key, on] of Object.entries(current)) {
    root.toggleAttribute(`data-pro-${key}`, on === true);
  }
};

export const getPrefs = (): ProPrefs => current;

export const setPref = <K extends keyof ProPrefs>(
  key: K,
  value: ProPrefs[K]
): void => {
  current = { ...current, [key]: value };
  try {
    localStorage.setItem(kStorageKey, JSON.stringify(current));
  } catch {
    // Storage unavailable: the change still applies to this page.
  }
  applyToDocument();
  for (const listener of listeners) listener();
};

export const subscribePrefs = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useProPref = <K extends keyof ProPrefs>(key: K): ProPrefs[K] =>
  useSyncExternalStore(subscribePrefs, () => current[key]);

if (typeof document !== "undefined") applyToDocument();
