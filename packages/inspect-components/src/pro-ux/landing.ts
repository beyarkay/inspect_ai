/** Scrolling a transcript so something inside an event lands in clear view,
 *  below the sticky chrome and the event's own pinned header. */

export type LandingMode = "header" | "top" | "center";

export interface LandingGeometry {
  /** Viewport top and height of what should land. */
  targetTop: number;
  targetHeight: number;
  /** Viewport line where the event's header pins, and the header's height. */
  pinTop: number;
  headerHeight: number;
  /** Viewport bottom of the scroller. */
  viewBottom: number;
}

/** Space kept between a pinned header and a message landed under it. */
export const kLandingGap = 8;

/** Pixels to scroll so the target lands: a header on its pin line, a message
 *  just under the pinned header, a text match midway down the clear space. */
export const landingDelta = (g: LandingGeometry, mode: LandingMode): number => {
  if (mode === "header") return g.targetTop - g.pinTop;
  const clear = g.pinTop + g.headerHeight;
  if (mode === "top") return g.targetTop - (clear + kLandingGap);
  return g.targetTop + g.targetHeight / 2 - (clear + g.viewBottom) / 2;
};

export interface Landing {
  /** The event row, `[id=<event id>]`. */
  row: HTMLElement;
  /** Null lands the row's header. */
  target: Element | Range | null;
  mode: LandingMode;
}

export const eventRow = (
  scroller: HTMLElement,
  eventId: string
): HTMLElement | null =>
  scroller.querySelector<HTMLElement>(`[id="${CSS.escape(eventId)}"]`);

const headerOf = (row: HTMLElement): HTMLElement | null =>
  row.querySelector<HTMLElement>('[class*="_stickyWrapper_"]');

/** Viewport top of a sticky element where it would sit unpinned. */
const unpinnedTop = (el: HTMLElement): number => {
  const position = el.style.position;
  el.style.position = "static";
  const top = el.getBoundingClientRect().top;
  el.style.position = position;
  return top;
};

const measure = (scroller: HTMLElement, landing: Landing): LandingGeometry => {
  const box = scroller.getBoundingClientRect();
  const header = headerOf(landing.row);
  const stickyTop = header ? parseFloat(getComputedStyle(header).top) : NaN;
  const pinTop = box.top + (Number.isFinite(stickyTop) ? stickyTop : 0);
  const headerHeight = header?.getBoundingClientRect().height ?? 0;
  const geometry = { pinTop, headerHeight, viewBottom: box.bottom };
  if (landing.target === null || landing.mode === "header") {
    const top = header
      ? unpinnedTop(header)
      : landing.row.getBoundingClientRect().top;
    return { ...geometry, targetTop: top, targetHeight: headerHeight };
  }
  const rect = landing.target.getBoundingClientRect();
  return { ...geometry, targetTop: rect.top, targetHeight: rect.height };
};

const kUserInput = ["wheel", "touchmove", "mousedown", "keydown"] as const;

/** Re-aim the scroll each frame until the landing holds still: rows above
 *  are still being measured, markdown reflows and the chrome collapses
 *  while it runs. `locate` returns null while the row is not rendered yet.
 *  User input stops it. Returns a stop function. */
export const settleLanding = (
  scroller: HTMLElement,
  locate: () => Landing | null,
  maxFrames = 90
): (() => void) => {
  let frames = 0;
  let still = 0;
  let raf = 0;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    for (const type of kUserInput) scroller.removeEventListener(type, stop);
  };
  for (const type of kUserInput) {
    scroller.addEventListener(type, stop, { passive: true });
  }
  const step = () => {
    if (stopped) return;
    frames += 1;
    const landing = locate();
    if (landing) {
      const before = scroller.scrollTop;
      const delta = landingDelta(measure(scroller, landing), landing.mode);
      if (Math.abs(delta) > 1) scroller.scrollTop = before + delta;
      still = Math.abs(scroller.scrollTop - before) <= 1 ? still + 1 : 0;
    }
    if (still >= 4 || frames >= maxFrames) {
      stop();
      return;
    }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return stop;
};
