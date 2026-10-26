import type { AsciinemaPlayerHandle } from "@tsmono/react/components";

// Players are re-seeked at most this often while the clock runs or a scrub
// drags; each seek redraws a whole terminal.
const kSeekIntervalMs = 70;
// Skip re-seeking a player that is already this close (seconds).
const kSeekTolerance = 0.05;
// Scrolling further than this many lines above the newest output pins the
// body where the user put it.
const kPinLines = 2;

/** A session's player position (seconds into its recording) at the shared
 *  clock's current time; undefined for an unknown session. */
export type LocateSession = (key: string) => number | undefined;

interface Scroller {
  element: HTMLElement;
  pinned: boolean;
  detaching: boolean;
  /** The scrollTop we last set, so our own scrolls aren't read as the
   *  user's. */
  setTop: number;
  dispose: () => void;
}

/**
 * Keeps the shared view's players at the master clock's time. The players
 * never play on their own: each is seeked (throttled) to its session's local
 * time. Each row body is a scroll container that follows the newest output
 * (its last non-empty line kept at the bottom) until the user scrolls up past
 * a couple of lines, which pins it until they return to the bottom.
 */
export class PlayerSync {
  private readonly players = new Map<string, AsciinemaPlayerHandle>();
  private readonly scrollers = new Map<string, Scroller>();
  private readonly seekedTo = new Map<string, number>();
  private lastSync = 0;
  private trailing: number | undefined;
  private lineHeight: number;

  constructor(
    lineHeight: number,
    private readonly onLineHeight: (lineHeight: number) => void,
    private readonly onPinned: (key: string, pinned: boolean) => void
  ) {
    this.lineHeight = lineHeight;
  }

  /** Registers (or, with null, forgets) a session's player and seeks it. */
  setPlayer(
    key: string,
    player: AsciinemaPlayerHandle | null,
    locate: LocateSession
  ): void {
    this.seekedTo.delete(key);
    if (player) {
      this.players.set(key, player);
      this.sync(locate);
    } else {
      this.players.delete(key);
    }
  }

  /** Registers (or forgets) the scroll container holding a session's
   *  player. A ref callback that changes identity detaches and reattaches
   *  the same element within one commit, so detaching waits a microtask and
   *  a reattach keeps the scroller's state (e.g. pinned). */
  setScroller(key: string, element: HTMLElement | null): void {
    const previous = this.scrollers.get(key);
    if (!element) {
      if (!previous) return;
      previous.detaching = true;
      queueMicrotask(() => {
        if (this.scrollers.get(key) === previous && previous.detaching) {
          this.removeScroller(key, previous);
        }
      });
      return;
    }
    if (previous) {
      if (previous.element === element) {
        previous.detaching = false;
        return;
      }
      this.removeScroller(key, previous);
    }

    const onScroll = () => this.onUserScroll(key);
    const observer = new ResizeObserver(() => this.follow(key));
    element.addEventListener("scroll", onScroll, { passive: true });
    observer.observe(element);
    this.scrollers.set(key, {
      element,
      pinned: false,
      detaching: false,
      setTop: element.scrollTop,
      dispose: () => {
        element.removeEventListener("scroll", onScroll);
        observer.disconnect();
      },
    });
  }

  private removeScroller(key: string, scroller: Scroller): void {
    scroller.dispose();
    this.scrollers.delete(key);
    if (scroller.pinned) this.onPinned(key, false);
  }

  /** Unpins a session's body and returns it to the newest output. */
  jumpToLatest(key: string): void {
    const scroller = this.scrollers.get(key);
    if (!scroller) return;
    this.setPinned(key, scroller, false);
    this.follow(key);
  }

  /** Seeks every player to the clock, at most once per seek interval, with a
   *  trailing seek so the last position of a drag always lands. */
  request(locate: LocateSession): void {
    window.clearTimeout(this.trailing);
    const wait = kSeekIntervalMs - (performance.now() - this.lastSync);
    if (wait <= 0) {
      this.sync(locate);
    } else {
      this.trailing = window.setTimeout(() => this.sync(locate), wait);
    }
  }

  dispose(): void {
    window.clearTimeout(this.trailing);
    for (const scroller of this.scrollers.values()) scroller.dispose();
    this.scrollers.clear();
  }

  private sync(locate: LocateSession): void {
    this.lastSync = performance.now();
    for (const [key, player] of this.players) {
      const local = locate(key);
      if (local === undefined) continue;
      const previous = this.seekedTo.get(key);
      if (previous !== undefined && Math.abs(previous - local) < kSeekTolerance)
        continue;
      this.seekedTo.set(key, local);
      // The frame at the new time draws on the next animation frame.
      player.seek(local).then(
        () => requestAnimationFrame(() => this.follow(key)),
        () => undefined
      );
    }
  }

  // Scrolls a following body so its last non-empty line sits at the bottom.
  private follow(key: string): void {
    const scroller = this.scrollers.get(key);
    if (!scroller || scroller.pinned) return;
    const target = this.followTop(scroller.element);
    if (target === undefined) return;
    scroller.element.scrollTop = target;
    scroller.setTop = scroller.element.scrollTop;
  }

  private onUserScroll(key: string): void {
    const scroller = this.scrollers.get(key);
    if (!scroller) return;
    const top = scroller.element.scrollTop;
    if (Math.abs(top - scroller.setTop) < 1) return;
    const target = this.followTop(scroller.element);
    if (target === undefined) return;
    this.setPinned(key, scroller, target - top > kPinLines * this.lineHeight);
  }

  private setPinned(key: string, scroller: Scroller, pinned: boolean): void {
    if (scroller.pinned === pinned) return;
    scroller.pinned = pinned;
    this.onPinned(key, pinned);
  }

  // The scrollTop that puts the last non-empty line at the bottom of the
  // body's visible area; also picks up the line height the player's width-fit
  // produced.
  private followTop(element: HTMLElement): number | undefined {
    const lines = element.querySelectorAll(".ap-line");
    const term = element.querySelector(".ap-term");
    if (!term || lines.length === 0) return undefined;
    const termRect = term.getBoundingClientRect();
    // The line pitch: a line's own box can be shorter than the spacing the
    // terminal lays lines out at.
    const pitch = termRect.height / lines.length;
    if (pitch > 0 && Math.abs(pitch - this.lineHeight) > 0.25) {
      this.lineHeight = pitch;
      this.onLineHeight(pitch);
    }
    let last = lines.length - 1;
    while (last > 0 && !lines[last]?.textContent.trim()) last--;
    const termTop =
      termRect.top - element.getBoundingClientRect().top + element.scrollTop;
    const bottomPadding = parseFloat(getComputedStyle(element).paddingBottom);
    const lineBottom = termTop + (last + 1) * this.lineHeight;
    return Math.max(0, lineBottom + bottomPadding - element.clientHeight);
  }
}
