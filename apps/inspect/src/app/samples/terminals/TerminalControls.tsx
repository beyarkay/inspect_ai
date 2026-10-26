import clsx from "clsx";
import { FC, ReactNode, useRef, useState } from "react";

import { useUnmount } from "@tsmono/react/hooks";

import { formatClock } from "./format";
import { kPlaybackSpeeds } from "./terminalModel";
import styles from "./Terminals.module.css";

// Hovering the folded timeline this long (ms) peeks the full lanes.
const kPeekDelayMs = 150;

interface TerminalControlsProps {
  playing: boolean;
  ended: boolean;
  onTogglePlay: () => void;
  real: number;
  duration: number;
  playback: number;
  playbackDuration: number;
  speed: number;
  onSpeedChange: (speed: number) => void;
  /** Shown while the user holds a row other than the agent's. */
  hold?: { session: string; agentSession?: string };
  onFollow: () => void;
  /** Real seconds skipped in the current (or just-ended) idle gap. */
  idleSkipped?: number;
  idleVisible: boolean;
  /** Real seconds the whole run's idle shortening skips. */
  totalIdleSkipped: number;
  /** What's at the playhead, while the user drags it. */
  scrubPreview?: string;
  timelineFolded: boolean;
  onToggleTimeline: () => void;
  /** The folded timeline, which sits inline in the control row. */
  foldedTimeline?: ReactNode;
  /** The full timeline, peeked over the stage while hovering the folded
   *  one. */
  peekTimeline: ReactNode;
  children?: ReactNode;
}

/** The shared view's play button, readout, chips and speed (brief §6.1),
 *  with the timeline below it. */
export const TerminalControls: FC<TerminalControlsProps> = ({
  playing,
  ended,
  onTogglePlay,
  real,
  duration,
  playback,
  playbackDuration,
  speed,
  onSpeedChange,
  hold,
  onFollow,
  idleSkipped,
  idleVisible,
  totalIdleSkipped,
  scrubPreview,
  timelineFolded,
  onToggleTimeline,
  foldedTimeline,
  peekTimeline,
  children,
}) => {
  const [peek, setPeek] = useState(false);
  const peekTimer = useRef<number | undefined>(undefined);
  const endPeek = () => {
    window.clearTimeout(peekTimer.current);
    setPeek(false);
  };
  useUnmount(() => window.clearTimeout(peekTimer.current));

  const idleChip =
    idleSkipped !== undefined ? (
      <span
        className={clsx(
          styles.chip,
          styles.idleChip,
          !idleVisible && styles.chipHidden
        )}
        aria-hidden={!idleVisible}
      >
        <span className={styles.idleDot} aria-hidden="true" />
        agent thinking · {formatClock(idleSkipped)} skipped
      </span>
    ) : null;

  return (
    <div className={styles.controls} onPointerLeave={endPeek}>
      {timelineFolded && peek ? (
        <div className={styles.peek}>{peekTimeline}</div>
      ) : null}
      <div className={styles.controlRow}>
        <button
          type="button"
          className={styles.playButton}
          onClick={onTogglePlay}
          aria-label={playing ? "Pause" : ended ? "Replay" : "Play"}
          title={playing ? "Pause (Space)" : ended ? "Replay" : "Play (Space)"}
        >
          {playing ? "❚❚" : ended ? "↻" : "▶"}
        </button>
        <span className={styles.readout} aria-label="Elapsed in the run">
          <span className={styles.readoutElapsed}>{formatClock(real)}</span>
          <span className={styles.readoutTotal}>/ {formatClock(duration)}</span>
        </span>
        {timelineFolded ? null : (
          <span className={styles.readoutNotes}>
            {ended ? (
              <>
                <span>run complete</span>
                <span>
                  played in {formatClock(playbackDuration)}
                  {totalIdleSkipped >= 1
                    ? ` · ${formatClock(totalIdleSkipped)} of idle skipped`
                    : ""}
                </span>
              </>
            ) : (
              <>
                <span>elapsed in the run</span>
                <span>
                  plays in {formatClock(playback)} /{" "}
                  {formatClock(playbackDuration)}
                </span>
              </>
            )}
          </span>
        )}
        {scrubPreview ? (
          <span className={clsx(styles.chip, styles.scrubChip)}>
            {scrubPreview}
          </span>
        ) : hold ? (
          <button
            type="button"
            className={clsx(styles.chip, styles.holdChip)}
            onClick={onFollow}
            title="Follow the agent again (F)"
          >
            holding {hold.session}
            {hold.agentSession ? ` · agent is in ${hold.agentSession}` : ""} —
            follow again
          </button>
        ) : timelineFolded ? null : (
          idleChip
        )}
        {foldedTimeline ? (
          <span
            className={styles.foldedTimeline}
            onPointerEnter={() => {
              window.clearTimeout(peekTimer.current);
              peekTimer.current = window.setTimeout(
                () => setPeek(true),
                kPeekDelayMs
              );
            }}
          >
            {foldedTimeline}
            {hold || scrubPreview ? null : idleChip}
          </span>
        ) : (
          <span className={styles.controlSpacer} />
        )}
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
                styles.speedButton,
                speed === option && styles.speedButtonActive
              )}
              aria-pressed={speed === option}
              onClick={() => onSpeedChange(option)}
            >
              {option}×
            </button>
          ))}
        </span>
        <button
          type="button"
          className={styles.iconButton}
          onClick={() => {
            endPeek();
            onToggleTimeline();
          }}
          aria-label={timelineFolded ? "Show timeline" : "Fold timeline"}
          title={timelineFolded ? "Show timeline" : "Fold timeline"}
        >
          {timelineFolded ? "▲" : "▼"}
        </button>
      </div>
      {children}
    </div>
  );
};
