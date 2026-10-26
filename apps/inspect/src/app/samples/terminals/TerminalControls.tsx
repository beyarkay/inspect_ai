import clsx from "clsx";
import { FC, ReactNode } from "react";

import { formatClock } from "./format";
import { kPlaybackSpeeds } from "./terminalModel";
import styles from "./Terminals.module.css";

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
  timelineFolded: boolean;
  onToggleTimeline: () => void;
  /** The folded timeline, which sits inline in the control row. */
  foldedTimeline?: ReactNode;
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
  timelineFolded,
  onToggleTimeline,
  foldedTimeline,
  children,
}) => (
  <div className={styles.controls}>
    <div className={styles.controlRow}>
      <button
        type="button"
        className={styles.playButton}
        onClick={onTogglePlay}
        aria-label={playing ? "Pause" : ended ? "Replay" : "Play"}
        title={playing ? "Pause (Space)" : "Play (Space)"}
      >
        {playing ? "❚❚" : ended ? "↻" : "▶"}
      </button>
      <span className={styles.readout} aria-label="Elapsed in the run">
        <span className={styles.readoutElapsed}>{formatClock(real)}</span>
        <span className={styles.readoutTotal}>/ {formatClock(duration)}</span>
      </span>
      {timelineFolded ? null : (
        <span className={styles.readoutNotes}>
          <span>{ended ? "run complete" : "elapsed in the run"}</span>
          <span>
            {ended ? "played in " : "plays in "}
            {ended
              ? formatClock(playbackDuration)
              : `${formatClock(playback)} / ${formatClock(playbackDuration)}`}
          </span>
        </span>
      )}
      {hold ? (
        <button
          type="button"
          className={styles.chip}
          onClick={onFollow}
          title="Follow the agent again (F)"
        >
          holding {hold.session}
          {hold.agentSession ? ` · agent is in ${hold.agentSession}` : ""} —
          follow again
        </button>
      ) : null}
      {foldedTimeline ?? <span className={styles.controlSpacer} />}
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
        onClick={onToggleTimeline}
        aria-label={timelineFolded ? "Show timeline" : "Fold timeline"}
        title={timelineFolded ? "Show timeline" : "Fold timeline"}
      >
        {timelineFolded ? "▲" : "▼"}
      </button>
    </div>
    {children}
  </div>
);
