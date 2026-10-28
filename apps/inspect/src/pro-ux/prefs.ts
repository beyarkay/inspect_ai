import { useSyncExternalStore } from "react";

export interface ProPrefs {
  collapseEmptyColumns: boolean;
  wrapCells: boolean;
  scoreBadges: boolean;
  quantityUnderlines: boolean;
  printedKeys: boolean;
  detailedOutline: boolean;
  turnMarkers: boolean;
  smartScores: boolean;
  trajectoryColumn: boolean;
}

export const kPrefDefaults: ProPrefs = {
  collapseEmptyColumns: true,
  wrapCells: false,
  scoreBadges: true,
  quantityUnderlines: true,
  printedKeys: true,
  detailedOutline: true,
  turnMarkers: true,
  smartScores: true,
  trajectoryColumn: true,
};

export const kPrefKeys: (keyof ProPrefs)[] = [
  "collapseEmptyColumns",
  "wrapCells",
  "scoreBadges",
  "quantityUnderlines",
  "printedKeys",
  "detailedOutline",
  "turnMarkers",
  "smartScores",
  "trajectoryColumn",
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
  scoreBadges: ["Score badges", "Scores coloured on a purple–green scale"],
  quantityUnderlines: [
    "Value bars on tokens and durations",
    "Taller and darker for more, log scale",
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
  trajectoryColumn: [
    "Trajectory column in sample tables",
    "Each sample's conversation as coloured spans; a shared input shown once",
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
