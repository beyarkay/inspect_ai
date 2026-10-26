import clsx from "clsx";
import { FC, useRef, useState } from "react";

import {
  AsciinemaPlayer,
  type AsciinemaPlayerHandle,
} from "@tsmono/react/components";
import { useEventListener } from "@tsmono/react/hooks";

import { commandLabel } from "./asciicast";
import { formatClock } from "./format";
import {
  kMaxRows,
  kRowBodyPadding,
  kTailRows,
  type RowState,
  type TerminalCommand,
  type TerminalSession,
} from "./terminalModel";
import styles from "./Terminals.module.css";

interface TerminalRowProps {
  id: string;
  session: TerminalSession;
  state: Exclude<RowState, "pending">;
  bodyRows: number;
  lineHeight: number;
  lastCommand?: TerminalCommand;
  /** The last output line, for bars without a body. */
  snippet?: string;
  /** Playing: a row that appears flashes its bar. */
  animate: boolean;
  /** A command just landed in this row while the user holds another. */
  pulse: boolean;
  onHold: () => void;
  onToggleFold: () => void;
  onExpand: () => void;
  onTogglePlay: () => void;
  onKey: (e: KeyboardEvent) => void;
  onPlayer: (player: AsciinemaPlayerHandle | null) => void;
  scrollerRef: (scroller: HTMLDivElement | null) => void;
  /** The user scrolled the body up, away from the newest output. */
  pinned: boolean;
  onJumpToLatest: () => void;
}

/**
 * One terminal session in the shared view: a bar that names it and its last
 * command, and (when the allocation gives it rows) a bottom-anchored body the
 * shared clock drives.
 */
export const TerminalRow: FC<TerminalRowProps> = ({
  id,
  session,
  state,
  bodyRows,
  lineHeight,
  lastCommand,
  snippet,
  animate,
  pulse,
  onHold,
  onToggleFold,
  onExpand,
  onTogglePlay,
  onKey,
  onPlayer,
  scrollerRef,
  pinned,
  onJumpToLatest,
}) => {
  const hasBody = bodyRows > 0;
  // Only a session opening during playback flashes, not every row on load.
  const [flashOnOpen] = useState(animate);
  const showPulse = pulse && state !== "focused" && lastCommand !== undefined;
  const canFold = state === "open" || state === "folded";
  return (
    <div
      className={clsx(
        styles.row,
        state === "focused" && styles.rowFocused,
        state === "open" && styles.rowOpen,
        state === "folded" && styles.rowFolded,
        state === "closed" && styles.rowClosed
      )}
      data-session={session.name}
      data-state={state}
    >
      <div className={styles.bar}>
        {flashOnOpen ? (
          <span className={styles.barFlash} aria-hidden="true" />
        ) : null}
        {showPulse ? (
          // Keyed by the command, so each new one restarts the animation.
          <span
            key={lastCommand.at}
            className={styles.barFlash}
            aria-hidden="true"
          />
        ) : null}
        <button
          type="button"
          className={clsx(styles.barButton, styles.chevron)}
          onClick={canFold ? onToggleFold : onHold}
          aria-expanded={hasBody}
          aria-label={
            canFold
              ? `${hasBody ? "Fold" : "Unfold"} ${session.name}`
              : `Focus ${session.name}`
          }
          disabled={state === "closed"}
        >
          {hasBody ? "▾" : "▸"}
        </button>
        <button
          type="button"
          className={clsx(styles.barButton, styles.barMain)}
          onClick={state === "closed" ? onExpand : onHold}
          title={
            state === "closed"
              ? `Open ${session.name} at its end`
              : state === "focused"
                ? undefined
                : `Focus ${session.name}`
          }
        >
          <span className={styles.sessionName}>{session.name}</span>
          {state === "closed" ? (
            <span>ended {formatClock(session.end)}</span>
          ) : null}
          {lastCommand ? (
            <span className={styles.lastCommand}>
              $ {commandLabel(lastCommand.command)}
            </span>
          ) : null}
          {snippet ? <span className={styles.snippet}>· {snippet}</span> : null}
          <span className={styles.barMeta}>
            {showPulse ? (
              <span key={lastCommand.at} className={styles.newCommand}>
                new command
              </span>
            ) : null}
            {state === "open" || state === "folded" ? (
              <span>
                <span className={styles.liveDot} aria-hidden="true" />
                {state === "folded" ? "open · folded" : "open"}
              </span>
            ) : null}
            {hasBody ? <span>{rowsReadout(state, bodyRows)}</span> : null}
          </span>
        </button>
        <button
          type="button"
          className={clsx(styles.barButton, styles.expand)}
          onClick={onExpand}
          aria-label={`Expand ${session.name}`}
          title={`Open ${session.name} on its own`}
        >
          ⤢
        </button>
      </div>
      {hasBody ? (
        <TerminalBody
          id={id}
          session={session}
          height={bodyRows * lineHeight + kRowBodyPadding}
          onTogglePlay={onTogglePlay}
          onKey={onKey}
          onPlayer={onPlayer}
          scrollerRef={scrollerRef}
          pinned={pinned}
          onJumpToLatest={onJumpToLatest}
        />
      ) : null}
    </div>
  );
};

interface TerminalBodyProps {
  id: string;
  session: TerminalSession;
  height: number;
  onTogglePlay: () => void;
  onKey: (e: KeyboardEvent) => void;
  onPlayer: (player: AsciinemaPlayerHandle | null) => void;
  scrollerRef: (scroller: HTMLDivElement | null) => void;
  pinned: boolean;
  onJumpToLatest: () => void;
}

// The body scrolls (the view keeps it on the newest output unless the user
// scrolls up) and its text selects. A plain click toggles playback, as in the
// single-session player; Space is the keyboard equivalent, handled by the
// view.
const TerminalBody: FC<TerminalBodyProps> = ({
  id,
  session,
  height,
  onTogglePlay,
  onKey,
  onPlayer,
  scrollerRef,
  pinned,
  onJumpToLatest,
}) => {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  useEventListener(bodyRef, "click", () => {
    // The end of a drag to select text also fires a click.
    if (!window.getSelection()?.toString()) onTogglePlay();
  });
  // The player is display-only (the shared clock seeks it) but takes focus
  // when clicked, and its own keys would play it: the view handles keys from
  // inside the body before the player sees them.
  useEventListener(
    bodyRef,
    "keydown",
    (e) => {
      e.stopPropagation();
      onKey(e);
    },
    { capture: true }
  );
  return (
    <div className={styles.bodyFrame} style={{ height }}>
      <div
        ref={(element) => {
          bodyRef.current = element;
          scrollerRef(element);
        }}
        className={styles.body}
      >
        <AsciinemaPlayer
          id={id}
          cast={session.cast}
          rows={session.rows}
          cols={session.cols}
          fit="width"
          autoPlay={false}
          controls={false}
          idleTimeLimit={null}
          poster="npt:0"
          onPlayer={onPlayer}
        />
      </div>
      {pinned ? (
        <button
          type="button"
          className={styles.latest}
          onClick={onJumpToLatest}
          title="Follow the newest output again"
        >
          ↓ Latest
        </button>
      ) : null}
    </div>
  );
};

const rowsReadout = (state: RowState, rows: number): string =>
  state === "focused"
    ? `${rows} of ${kMaxRows} rows`
    : rows > kTailRows
      ? `tail · ${rows} rows`
      : `open · ${kTailRows}-row floor`;
