import { useSyncExternalStore } from "react";

import { isRankedLabel } from "./cells";

/** Header cell space beside the label: padding, sort arrow, resize grip. */
export const kHeaderChrome = 38;
/** The value-bar wedge drawn after ranked labels, with its margin. */
export const kHeaderWedge = 24;

const cache = new Map<string, number>();
let probe: HTMLSpanElement | null = null;

const fontSet = (): FontFaceSet | undefined =>
  typeof document !== "undefined" && "fonts" in document
    ? document.fonts
    : undefined;

const fontsLoaded = (): boolean => fontSet()?.status === "loaded";

const subscribeFonts = (listener: () => void): (() => void) => {
  const fonts = fontSet();
  if (!fonts) return () => {};
  fonts.addEventListener("loadingdone", listener);
  fonts.ready.then(listener, () => undefined);
  return () => fonts.removeEventListener("loadingdone", listener);
};

/** Rendered width of a header label in the pro-ux header style; 0 where
 *  there is no layout (tests). */
const labelWidth = (label: string): number => {
  const hit = cache.get(label);
  if (hit !== undefined) return hit;
  if (typeof document === "undefined") return 0;
  if (!probe) {
    probe = document.createElement("span");
    probe.setAttribute("aria-hidden", "true");
    Object.assign(probe.style, {
      position: "absolute",
      left: "-9999px",
      top: "0",
      visibility: "hidden",
      whiteSpace: "nowrap",
      font: '14px "EB Garamond", Garamond, Georgia, serif',
      fontVariantCaps: "all-small-caps",
      letterSpacing: "0.04em",
    });
    document.body.appendChild(probe);
  }
  probe.textContent = label;
  const width = Math.ceil(probe.getBoundingClientRect().width);
  if (fontsLoaded()) cache.set(label, width);
  return width;
};

/** The narrowest a column can be while still showing its whole header. */
export const headerMinWidth = (label: string, width: number): number =>
  width > 0
    ? width + kHeaderChrome + (isRankedLabel(label) ? kHeaderWedge : 0)
    : 0;

interface SizedColumn {
  header?: unknown;
  size?: number;
  minSize?: number;
  maxSize?: number;
}

/** Widen columns whose fixed size would cut their header label short. */
export const fitHeaders = <C extends SizedColumn>(
  columns: readonly C[],
  skip: ReadonlySet<string>,
  idOf: (c: C) => string | undefined,
  measure: (label: string) => number = labelWidth
): C[] =>
  columns.map((c) => {
    const id = idOf(c);
    if (typeof c.header !== "string" || (id !== undefined && skip.has(id)))
      return c;
    const min = headerMinWidth(c.header, measure(c.header));
    if (min === 0 || (c.minSize ?? 0) >= min) return c;
    return {
      ...c,
      minSize: min,
      size: Math.max(c.size ?? 0, min),
      maxSize: c.maxSize !== undefined ? Math.max(c.maxSize, min) : c.maxSize,
    };
  });

/** Re-render once web fonts finish loading, so widths use the real font. */
export const useFontsLoaded = (): boolean =>
  useSyncExternalStore(subscribeFonts, fontsLoaded, () => false);
