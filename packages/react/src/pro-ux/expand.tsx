import "./expand.css";

import {
  CSSProperties,
  FC,
  useCallback,
  useState,
  useSyncExternalStore,
} from "react";

/** Fewer hidden lines than this are shown rather than put behind a toggle:
 *  the 3rem fade plus the button already cover about that much, so hiding
 *  less saves no space and costs a click. */
export const kMinHiddenLines = 4;

/** Whether content `hiddenPx` taller than its collapsed box should collapse. */
export const worthCollapsing = (hiddenPx: number, linePx: number): boolean =>
  hiddenPx > kMinHiddenLines * linePx;

export const hiddenLineCount = (hiddenPx: number, linePx: number): number =>
  Math.max(1, Math.round(hiddenPx / linePx));

/** The element's line height in px; "normal" is about 1.2 × its font size. */
export const lineHeightOf = (element: Element): number => {
  const style = window.getComputedStyle(element);
  const line = parseFloat(style.lineHeight);
  if (Number.isFinite(line) && line > 0) return line;
  const font = parseFloat(style.fontSize);
  return Number.isFinite(font) && font > 0 ? font * 1.2 : 19;
};

const subscribe = (onChange: () => void): (() => void) => {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-pro-ux"],
  });
  return () => observer.disconnect();
};

/** Whether the pro-UX skin is on (`<html data-pro-ux>`). */
export const useProUx = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => document.documentElement.hasAttribute("data-pro-ux"),
    () => false
  );

interface ProExpandControlsProps {
  collapsed: boolean;
  /** Distance from the panel's top to the bottom of the collapsed box, px. */
  boundary: number;
  hiddenLines: number;
  /** Toggle from the in-place button: nothing scrolls, so the button stays
   *  under the pointer for the next click. */
  onToggle: () => void;
  /** Rendered when the expanded panel's in-place button is off screen. */
  renderStickyLess: () => React.ReactNode;
}

/** "less" pinned to the bottom of the viewport while the in-place button is
 *  scrolled away; collapsing from here scrolls the panel back into view. */
export const ProStickyLess: FC<{ onToggle: () => void }> = ({ onToggle }) => (
  <button
    type="button"
    className="pro-expand-btn pro-expand-sticky"
    aria-expanded="true"
    title="Collapse to the first lines"
    onClick={onToggle}
  >
    <span aria-hidden="true" className="pro-expand-caret">
      ▴
    </span>
    less
  </button>
);

const kFade = "3rem";

/** One button that never moves: centred where the collapsed box ends, reading
 *  "more" while collapsed and "less" while expanded. The faded strip above it
 *  expands too. */
export const ProExpandControls: FC<ProExpandControlsProps> = ({
  collapsed,
  boundary,
  hiddenLines,
  onToggle,
  renderStickyLess,
}) => {
  const [inView, setInView] = useState(true);
  const watch = useCallback((el: HTMLButtonElement | null) => {
    if (!el) return undefined;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) setInView(entry.isIntersecting);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const strip: CSSProperties = {
    top: `calc(${boundary}px - ${kFade})`,
    height: kFade,
  };
  const lines = `${hiddenLines} more ${hiddenLines === 1 ? "line" : "lines"}`;
  return (
    <>
      {collapsed ? (
        <div
          className="pro-expand-fade"
          style={strip}
          role="presentation"
          title={`Show ${lines}`}
          onClick={onToggle}
        />
      ) : null}
      <div className="pro-expand-anchor" style={{ top: boundary }}>
        <button
          ref={watch}
          type="button"
          className="pro-expand-btn"
          aria-expanded={!collapsed}
          title={collapsed ? `Show ${lines}` : "Collapse to the first lines"}
          onClick={onToggle}
        >
          <span aria-hidden="true" className="pro-expand-caret">
            {collapsed ? "▾" : "▴"}
          </span>
          {collapsed ? lines : "less"}
        </button>
      </div>
      {!collapsed && !inView ? renderStickyLess() : null}
    </>
  );
};
