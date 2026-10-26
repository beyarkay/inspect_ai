import clsx from "clsx";
import { FC, PointerEvent, useRef } from "react";

import { commandLabel } from "./asciicast";
import { formatClock } from "./format";
import {
  realToPlayback,
  sessionPhase,
  type TerminalAgent,
  type TerminalCommand,
  type TerminalSample,
} from "./terminalModel";
import styles from "./Terminals.module.css";

// Ruler labels every five minutes of real time.
const kRulerStep = 300;
// Labels closer than this (as a fraction of the width) to the previous one
// are dropped: idle shortening packs real time unevenly.
const kRulerMinGap = 0.05;

interface TerminalTimelineProps {
  sample: TerminalSample;
  agent: TerminalAgent;
  real: number;
  /** The row the stage shows as focused (agent's or held). */
  focusKey?: string;
  /** The agent's own session at the playhead. */
  agentFocusKey?: string;
  onScrub: (playback: number) => void;
  onHold: (sessionKey: string) => void;
  onSeekCommand: (command: TerminalCommand) => void;
}

/**
 * One lane per session over the shared clock (brief §6.2): lifetime track,
 * focus segments, a tick per command, and a draggable playhead. The x axis is
 * playback time, so busy stretches get the room.
 */
export const TerminalTimeline: FC<TerminalTimelineProps> = ({
  sample,
  agent,
  real,
  focusKey,
  agentFocusKey,
  onScrub,
  onHold,
  onSeekCommand,
}) => {
  const x = (time: number) => fraction(sample, time);
  const scrub = useScrub(sample.playbackDuration, onScrub);
  return (
    <div className={styles.timeline}>
      <div className={styles.laneLabels}>
        {agent.sessions.map((session) => {
          const phase = sessionPhase(session, real);
          const glyph =
            session.key === agentFocusKey ? "●" : phase === "open" ? "○" : "·";
          return (
            <button
              key={session.key}
              type="button"
              className={clsx(
                styles.laneLabel,
                session.key === focusKey && styles.laneLabelFocused
              )}
              onClick={() => onHold(session.key)}
              disabled={phase !== "open"}
              title={`Focus ${session.name}`}
            >
              {glyph} {session.name}
            </button>
          );
        })}
      </div>
      <div
        className={styles.track}
        style={{ height: 22 + agent.sessions.length * 18 }}
        {...scrub}
      >
        <div className={styles.ruler}>
          {rulerMarks(sample).map(({ time, at, end }) => (
            <span
              key={time}
              className={clsx(styles.rulerLabel, end && styles.rulerLabelEnd)}
              style={{ left: percent(at) }}
            >
              {formatClock(time)}
            </span>
          ))}
        </div>
        {agent.sessions.map((session, i) => (
          <div
            key={session.key}
            className={styles.lane}
            style={{ top: 22 + i * 18 }}
          >
            <SessionLane
              agent={agent}
              sessionKey={session.key}
              start={x(session.start)}
              end={x(session.end)}
              x={x}
              onSeekCommand={onSeekCommand}
            />
          </div>
        ))}
        <div className={styles.playhead} style={{ left: percent(x(real)) }} />
      </div>
    </div>
  );
};

interface FoldedTimelineProps {
  sample: TerminalSample;
  agent: TerminalAgent;
  real: number;
  focusKey?: string;
  onScrub: (playback: number) => void;
  onSeekCommand: (command: TerminalCommand) => void;
}

/** The folded timeline (brief §6.3): the focused session's lane alone, inline
 *  in the control row. */
export const FoldedTimeline: FC<FoldedTimelineProps> = ({
  sample,
  agent,
  real,
  focusKey,
  onScrub,
  onSeekCommand,
}) => {
  const x = (time: number) => fraction(sample, time);
  const scrub = useScrub(sample.playbackDuration, onScrub);
  const focused = agent.sessions.find((session) => session.key === focusKey);
  return (
    <>
      {focused ? (
        <span className={styles.foldedFocus}>● {focused.name}</span>
      ) : null}
      <div className={styles.foldedTrack} {...scrub}>
        {focused ? (
          <div className={styles.lane}>
            <SessionLane
              agent={agent}
              sessionKey={focused.key}
              start={x(focused.start)}
              end={x(focused.end)}
              x={x}
              onSeekCommand={onSeekCommand}
            />
          </div>
        ) : null}
        <div className={styles.playhead} style={{ left: percent(x(real)) }} />
      </div>
    </>
  );
};

interface SessionLaneProps {
  agent: TerminalAgent;
  sessionKey: string;
  start: number;
  end: number;
  x: (time: number) => number;
  onSeekCommand: (command: TerminalCommand) => void;
}

const SessionLane: FC<SessionLaneProps> = ({
  agent,
  sessionKey,
  start,
  end,
  x,
  onSeekCommand,
}) => (
  <>
    <div
      className={styles.lifetime}
      style={{ left: percent(start), width: percent(end - start) }}
    />
    {agent.focusSegments
      .filter((segment) => segment.sessionKey === sessionKey)
      .map((segment) => (
        <div
          key={segment.start}
          className={styles.focusSegment}
          style={{
            left: percent(x(segment.start)),
            width: percent(x(segment.end) - x(segment.start)),
          }}
        />
      ))}
    {agent.commands
      .filter((command) => command.sessionKey === sessionKey)
      .map((command) => (
        <div
          key={command.at}
          className={styles.tick}
          style={{ left: percent(x(command.at)) }}
          title={`${formatClock(command.at)} · $ ${commandLabel(command.command)}`}
          onPointerDown={(e) => {
            e.stopPropagation();
            onSeekCommand(command);
          }}
        />
      ))}
  </>
);

const fraction = (sample: TerminalSample, real: number): number =>
  sample.playbackDuration > 0
    ? realToPlayback(sample, real) / sample.playbackDuration
    : 0;

const percent = (value: number): string => `${value * 100}%`;

const rulerMarks = (
  sample: TerminalSample
): { time: number; at: number; end?: boolean }[] => {
  const end = { time: sample.duration, at: 1, end: true };
  const marks: { time: number; at: number; end?: boolean }[] = [];
  for (let time = 0; time < sample.duration; time += kRulerStep) {
    const at = fraction(sample, time);
    const previous = marks.at(-1);
    if (previous && at - previous.at < kRulerMinGap) continue;
    if (end.at - at < kRulerMinGap) break;
    marks.push({ time, at });
  }
  return [...marks, end];
};

// Pointer handlers that turn a press or drag on a track into playback times.
const useScrub = (
  playbackDuration: number,
  onScrub: (playback: number) => void
) => {
  const dragging = useRef(false);
  const scrubTo = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const at = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    onScrub(at * playbackDuration);
  };
  return {
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      dragging.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      scrubTo(e);
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
      if (dragging.current) scrubTo(e);
    },
    onPointerUp: () => {
      dragging.current = false;
    },
    onPointerCancel: () => {
      dragging.current = false;
    },
  };
};
