import clsx from "clsx";
import { FC, useMemo, useRef } from "react";
import { createPortal } from "react-dom";

import { AsciinemaPlayer } from "@tsmono/react/components";
import { useEventListener } from "@tsmono/react/hooks";
import { Icon } from "@tsmono/react/icons";
import { formatTime } from "@tsmono/util";

import { castDuration, castMarkers, idleShortenedTime } from "./asciicast";
import styles from "./ExpandedTerminal.module.css";
import { kPlaybackSpeeds, type TerminalSession } from "./terminalModel";

// Pauses longer than this play as this long, so agent think time between
// commands doesn't stretch a session to many idle minutes.
const kIdleTimeLimit = 2;

// Think time at least this long is noted on the command marker that ends it.
const kIdleNoteMinGap = 30;

interface ExpandedTerminalProps {
  id: string;
  session: TerminalSession;
  /** Seconds into the recording (as captured) to start playing from. */
  startAt: number;
  speed: number;
  onSpeedChange: (speed: number) => void;
  onClose: () => void;
}

/**
 * One session full-viewport, scaled to show the whole terminal, playing on its
 * own idle-shortened clock with the player's controls.
 */
export const ExpandedTerminal: FC<ExpandedTerminalProps> = ({
  id,
  session,
  startAt,
  speed,
  onSpeedChange,
  onClose,
}) => {
  const duration = castDuration(session.cast, kIdleTimeLimit);
  const recorded = castDuration(session.cast);
  // Identity matters, not cost: the player is recreated when markers change.
  const markers = useMemo(
    () => castMarkers(session.cast, kIdleTimeLimit, kIdleNoteMinGap),
    [session.cast]
  );
  const overlayRef = useRef<HTMLDivElement>(null);

  // Window capture runs before any document listener, so stopping the event
  // here keeps Escape from also closing another surface (e.g. the find band).
  useEventListener(
    window,
    "keydown",
    (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      } else if (e.key === "Tab" && overlayRef.current) {
        trapFocus(e, overlayRef.current);
      }
    },
    { capture: true }
  );

  return createPortal(
    <div
      ref={overlayRef}
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={`Terminal ${session.name}`}
    >
      <div className={styles.overlayHeader}>
        <span className={styles.overlayTitleGroup}>
          <span className={styles.overlayTitle}>{session.name}</span>
          {recorded - duration >= 1 ? (
            <span className={clsx(styles.overlayNote, "text-size-small")}>
              Recorded over {formatTime(recorded)} ·{" "}
              <span className={styles.overlayNoteDetail}>
                pauses longer than {kIdleTimeLimit}s shortened
              </span>
            </span>
          ) : null}
        </span>
        <span className={styles.overlayControls}>
          <span
            className={styles.speedGroup}
            role="group"
            aria-label="Playback speed"
          >
            {kPlaybackSpeeds.map((option) => (
              <button
                key={option}
                type="button"
                className={clsx(
                  styles.headerButton,
                  speed === option && styles.headerButtonActive
                )}
                aria-pressed={speed === option}
                onClick={() => onSpeedChange(option)}
              >
                {option}×
              </button>
            ))}
          </span>
        </span>
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          title="Close (Esc)"
          aria-label="Close"
        >
          <Icon name="close" />
        </button>
      </div>
      <div className={styles.overlayBody}>
        <AsciinemaPlayer
          id={id}
          cast={session.cast}
          rows={session.rows}
          cols={session.cols}
          fit="both"
          autoPlay
          autoFocus
          clickToToggle
          controls
          idleTimeLimit={kIdleTimeLimit}
          startAt={idleShortenedTime(session.cast, startAt, kIdleTimeLimit)}
          markers={markers}
          speed={speed}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>,
    document.body
  );
};

const kTabbableSelector =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Keeps Tab / Shift+Tab cycling within the overlay (it is aria-modal).
const trapFocus = (e: KeyboardEvent, container: HTMLElement): void => {
  const tabbables = Array.from(
    container.querySelectorAll<HTMLElement>(kTabbableSelector)
  );
  const first = tabbables[0];
  const last = tabbables.at(-1);
  if (!first || !last) return;
  const active = document.activeElement;
  const inside = active instanceof Node && container.contains(active);
  if (e.shiftKey && (!inside || active === first)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (!inside || active === last)) {
    e.preventDefault();
    first.focus();
  }
};
