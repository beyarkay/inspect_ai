import clsx from "clsx";
import { FC, ReactNode, RefObject, useRef, useState } from "react";

import {
  useAnimationFrameLoop,
  useElementHeight,
  useEventListener,
  useMountEffect,
  useSpaceBelow,
  useUnmount,
} from "@tsmono/react/hooks";
import { Icon } from "@tsmono/react/icons";

import { commandLabel } from "./asciicast";
import { PlayerSync } from "./playerSync";
import { TerminalControls } from "./TerminalControls";
import {
  adjacentCommand,
  allocateRows,
  focusAt,
  lastCommandAt,
  localTime,
  playbackToReal,
  realToPlayback,
  resultSnippet,
  rowStates,
  sessionPhase,
  type TerminalAgent,
  type TerminalCommand,
  type TerminalSample,
  type TimelineFold,
} from "./terminalModel";
import { TerminalRow } from "./TerminalRow";
import styles from "./Terminals.module.css";
import { FoldedTimeline, TerminalTimeline } from "./TerminalTimeline";

// Agent focus switches closer together than this collapse into one while
// playing (the stage's reflow eases over 200 ms).
const kFocusSwitchMs = 400;
// How long (wall seconds) a new command pulses its row's bar.
const kPulseSeconds = 0.6;
// Until a player has drawn and its line height can be measured.
const kDefaultLineHeight = 19.5;
const kMinViewHeight = 420;
// The stage's vertical padding (see Terminals.module.css).
const kStagePadding = 24;
// The fill-window header's height (see .fillHeader).
const kFillHeaderHeight = 44;
// Control row heights (see Terminals.module.css): the folded row, and what
// each timeline lane adds when unfolded.
const kFoldedControlsHeight = 51;
const kTimelineBaseHeight = 30;
const kTimelineLaneHeight = 18;

interface TerminalsViewProps {
  id: string;
  /** The sample's casts on one clock (buildTerminalSample). */
  sample: TerminalSample;
  /** The sample's scroll container; the view fills its visible height. */
  scrollRef: RefObject<HTMLDivElement | null>;
  /** The agent whose terminals show (default: the first). Changing it keeps
   *  the clock. */
  agentId?: string;
  /** Fullscreen: the view covers the viewport under its own header (title,
   *  agents note, the host's tools and an exit). The players and clock carry
   *  over; Escape or the exit control leaves it. */
  fill?: TerminalsFill;
}

export interface TerminalsFill {
  title: string;
  /** Tab-toolbar controls that move into the header (the agent picker). */
  tools?: ReactNode;
  onExit: () => void;
}

/**
 * Every terminal session of a sample, stacked full width and driven by one
 * master clock: idle time is shortened only while every terminal is idle, the
 * agent's active session gets the rows, and a timeline below shows each
 * session's lifetime, focus and commands. (Design brief:
 * design/inspect-multiterminal-design-brief in inspect_ai.)
 */
export const TerminalsView: FC<TerminalsViewProps> = (props) => {
  const agent =
    props.sample.agents.find((candidate) => candidate.id === props.agentId) ??
    props.sample.agents[0];
  return agent ? <SharedTerminals {...props} agent={agent} /> : null;
};

interface SharedTerminalsProps extends TerminalsViewProps {
  agent: TerminalAgent;
}

const SharedTerminals: FC<SharedTerminalsProps> = ({
  id,
  sample,
  agent,
  scrollRef,
  fill,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const space = useSpaceBelow(rootRef, scrollRef);
  // Filling the window, the root is the viewport (CSS); its height is what's
  // left after the fill header.
  const rootHeight = useElementHeight(rootRef, fill !== undefined);

  const [playback, setPlaybackState] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [held, setHeld] = useState<string>();
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  // The user's ▼/▲ choice, which sticks until the automatic choice (auto)
  // changes.
  const [timelineOverride, setTimelineOverride] = useState<{
    folded: boolean;
    auto: boolean;
  }>();
  const [scrubbing, setScrubbing] = useState(false);
  // While playing, the agent's focus as the stage shows it: switches closer
  // together than kFocusSwitchMs collapse, so rapid switching doesn't thrash
  // the layout.
  const [playingFocus, setPlayingFocus] = useState<string>();
  const [lineHeight, setLineHeight] = useState(kDefaultLineHeight);
  const [pinned, setPinned] = useState<ReadonlySet<string>>(new Set());

  // The clock's source of truth: the frame loop and scrubs advance it between
  // renders, so it can't wait on state.
  const clockRef = useRef(playback);
  const lastSwitchRef = useRef(0);
  const [players] = useState(
    () =>
      new PlayerSync(kDefaultLineHeight, setLineHeight, (key, isPinned) =>
        setPinned((current) => {
          const next = new Set(current);
          if (isPinned) next.add(key);
          else next.delete(key);
          return next;
        })
      )
  );
  useUnmount(() => players.dispose());

  const locate = (key: string) => {
    const session = sample.sessions.find((candidate) => candidate.key === key);
    return session
      ? localTime(session, playbackToReal(sample, clockRef.current))
      : undefined;
  };

  const setClock = (next: number) => {
    clockRef.current = Math.min(Math.max(next, 0), sample.playbackDuration);
    setPlaybackState(clockRef.current);
    players.request(locate);
    // Once the agent is in the held session, following it is the same view,
    // so the hold is over (as when the user clicks the agent's row).
    if (
      held !== undefined &&
      focusAt(agent, playbackToReal(sample, clockRef.current)) === held
    ) {
      setHeld(undefined);
    }
  };

  useAnimationFrameLoop((elapsed, now) => {
    setClock(clockRef.current + elapsed * speed);
    if (clockRef.current >= sample.playbackDuration) setPlaying(false);
    const clockReal = playbackToReal(sample, clockRef.current);

    const target = focusAt(agent, clockReal);
    if (
      target !== playingFocus &&
      now - lastSwitchRef.current >= kFocusSwitchMs
    ) {
      lastSwitchRef.current = now;
      setPlayingFocus(target);
    }
  }, playing);

  const real = playbackToReal(sample, playback);
  const ended = playback >= sample.playbackDuration;
  const settledFocus = agent.sessions.find(
    (session) =>
      session.key === playingFocus && sessionPhase(session, real) === "open"
  );
  const agentFocus =
    playing && settledFocus ? settledFocus.key : focusAt(agent, real);
  const heldSession = agent.sessions.find(
    (session) => session.key === held && sessionPhase(session, real) === "open"
  );
  const focusKey = heldSession?.key ?? agentFocus;
  const states = rowStates(agent.sessions, real, focusKey, folded);
  const lastCommands = new Map(
    agent.sessions.map((session) => [
      session.key,
      lastCommandAt(agent.commands, session.key, real),
    ])
  );

  const viewHeight = Math.max(
    fill ? rootHeight - kFillHeaderHeight : space,
    kMinViewHeight
  );
  const timelineHeight =
    kTimelineBaseHeight + agent.sessions.length * kTimelineLaneHeight;
  const allocate = (timeline: TimelineFold) =>
    allocateRows({
      rows: agent.sessions.map((session) => ({
        key: session.key,
        state: states.get(session.key) ?? "pending",
        lastCommandAt: lastCommands.get(session.key)?.at,
      })),
      stageHeight:
        viewHeight - kFoldedControlsHeight - timelineHeight - kStagePadding,
      foldGain: timelineHeight,
      lineHeight,
      timeline,
    });
  const autoAllocation = allocate("auto");
  const allocation =
    timelineOverride?.auto === autoAllocation.timelineFolded
      ? allocate(timelineOverride.folded ? "folded" : "unfolded")
      : autoAllocation;

  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
    } else {
      if (ended) setClock(0);
      setPlayingFocus(ended ? undefined : agentFocus);
      setPlaying(true);
    }
  };

  const hold = (key: string) => {
    setHeld(key === agentFocus ? undefined : key);
  };

  const follow = () => setHeld(undefined);

  const seekToCommand = (command: TerminalCommand) => {
    setHeld(undefined);
    setClock(realToPlayback(sample, command.at));
  };

  const toggleFold = (key: string) => {
    const next = new Set(folded);
    if (!next.delete(key)) next.add(key);
    setFolded(next);
  };

  // Folds the held row: a held row shows as focused, so the fold is visible
  // only once the hold is released.
  const foldHeld = (key: string) => {
    setFolded(new Set(folded).add(key));
    setHeld(undefined);
  };

  const stepCommand = (step: 1 | -1) => {
    const command = adjacentCommand(agent.commands, real, step);
    if (command) setClock(realToPlayback(sample, command.at));
  };

  const holdAdjacent = (step: 1 | -1) => {
    const open = agent.sessions.filter(
      (session) => sessionPhase(session, real) === "open"
    );
    const index = open.findIndex((session) => session.key === focusKey);
    const next = open[index + step];
    if (next) hold(next.key);
  };

  // The view's keys apply while nothing in particular has focus (the body or
  // the sample's scroll container) or focus is inside the view: the tab bar
  // and the lists around it keep their own keys.
  const ownsKeys = (target: EventTarget | null) =>
    target === document.body ||
    target === scrollRef.current ||
    (target instanceof Node && (rootRef.current?.contains(target) ?? false));

  const onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    // Escape leaves the filled window from anywhere (the control that filled
    // it keeps focus under the overlay).
    if (e.key === "Escape") {
      if (fill && !isEditable(e.target)) {
        e.preventDefault();
        fill.onExit();
      }
      return;
    }
    if (isEditable(e.target) || !ownsKeys(e.target)) return;
    const onButton = e.target instanceof HTMLButtonElement;
    if (e.key === " ") {
      // Space is play/pause everywhere in the view, including on its buttons
      // (a just-clicked bar keeps focus), so it doesn't activate them.
      e.preventDefault();
      togglePlay();
    } else if (e.key === "f" || e.key === "F") {
      follow();
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      holdAdjacent(e.key === "ArrowUp" ? -1 : 1);
    } else if (e.key === "[" || e.key === "]") {
      stepCommand(e.key === "[" ? -1 : 1);
    } else if (e.key === "Enter" && !onButton && heldSession) {
      e.preventDefault();
      foldHeld(heldSession.key);
    }
  };
  const endScrub = () => setScrubbing(false);
  useEventListener(document, "pointerup", endScrub);
  useEventListener(document, "pointercancel", endScrub);
  // The tab only mounts this view while it's selected, so the document is
  // the view's own while it listens.
  useEventListener(document, "keydown", onKey);

  // Commands landing after this real time pulse their (unfocused) row.
  const pulseSince = playbackToReal(sample, playback - kPulseSeconds * speed);
  const heldName = heldSession?.name;
  const focusSession = agent.sessions.find(
    (session) => session.key === focusKey
  );
  const focusCommand = focusKey ? lastCommands.get(focusKey) : undefined;
  const scrubPreview = scrubbing
    ? [
        focusSession ? `${focusSession.name} focused` : undefined,
        focusCommand ? `$ ${commandLabel(focusCommand.command)}` : undefined,
        `${agent.sessions.filter((session) => sessionPhase(session, real) === "open").length} open`,
      ]
        .filter((part) => part !== undefined)
        .join(" · ")
    : undefined;
  const timelineProps = {
    sample,
    agent,
    real,
    focusKey,
    agentFocusKey: agentFocus,
    onScrub: setClock,
    // A drag owns the clock: the frame loop would run away from the pointer.
    onScrubStart: () => {
      setPlaying(false);
      setScrubbing(true);
    },
    onHold: hold,
    onSeekCommand: seekToCommand,
  };
  const agentName = agent.sessions.find(
    (session) => session.key === agentFocus
  )?.name;

  return (
    <div
      ref={rootRef}
      className={clsx(styles.view, fill && styles.viewFill)}
      style={fill ? undefined : { maxHeight: viewHeight }}
      role={fill ? "region" : undefined}
      aria-label={fill ? "Terminals fullscreen" : undefined}
    >
      {fill ? (
        <FillHeader
          fill={fill}
          agentCount={sample.agents.length}
          agentName={agent.name}
        />
      ) : null}
      <div
        className={clsx(
          styles.stage,
          allocation.scrolls && styles.stageScrolls
        )}
      >
        {agent.sessions.map((session) => {
          const state = states.get(session.key);
          if (!state || state === "pending") return null;
          const key = session.key;
          return (
            <TerminalRow
              key={key}
              id={`${id}-${session.name}`}
              session={session}
              state={state}
              bodyRows={allocation.bodyRows.get(key) ?? 0}
              lineHeight={lineHeight}
              lastCommand={lastCommands.get(key)}
              snippet={
                state === "folded" || state === "closed"
                  ? resultSnippet(session, real)
                  : undefined
              }
              animate={playing}
              pulse={
                playing &&
                heldSession !== undefined &&
                (lastCommands.get(key)?.at ?? -1) >= pulseSince
              }
              onHold={() => hold(key)}
              onToggleFold={() => toggleFold(key)}
              onTogglePlay={togglePlay}
              onKey={onKey}
              onPlayer={(player) => players.setPlayer(key, player, locate)}
              scrollerRef={(scroller) => players.setScroller(key, scroller)}
              pinned={pinned.has(key)}
              onJumpToLatest={() => players.jumpToLatest(key)}
            />
          );
        })}
      </div>
      <TerminalControls
        playing={playing}
        ended={ended}
        onTogglePlay={togglePlay}
        real={real}
        duration={sample.duration}
        playback={playback}
        playbackDuration={sample.playbackDuration}
        speed={speed}
        onSpeedChange={setSpeed}
        hold={
          heldName ? { session: heldName, agentSession: agentName } : undefined
        }
        onFollow={follow}
        scrubPreview={scrubPreview}
        timelineFolded={allocation.timelineFolded}
        onToggleTimeline={() =>
          setTimelineOverride({
            folded: !allocation.timelineFolded,
            auto: autoAllocation.timelineFolded,
          })
        }
        foldedTimeline={
          allocation.timelineFolded ? (
            <FoldedTimeline key={agent.id} {...timelineProps} />
          ) : undefined
        }
        peekTimeline={<TerminalTimeline key={agent.id} {...timelineProps} />}
      >
        {/* Keyed by agent so a tick hovered for one agent doesn't leave its
            chip over another's lanes. */}
        {allocation.timelineFolded ? null : (
          <TerminalTimeline key={agent.id} {...timelineProps} />
        )}
      </TerminalControls>
    </div>
  );
};

// The filled window's header (brief §9's dialog header): title, agents note,
// the host's tools and the exit, which takes focus so the view's keys apply.
const FillHeader: FC<{
  fill: TerminalsFill;
  agentCount: number;
  agentName: string;
}> = ({ fill, agentCount, agentName }) => {
  const exitRef = useRef<HTMLButtonElement>(null);
  useMountEffect(() => exitRef.current?.focus());
  return (
    <div className={styles.fillHeader}>
      <span className={styles.fillTitle}>{fill.title}</span>
      {agentCount > 1 ? (
        <span className={styles.fillNote}>
          {agentCount} agents in this sample · showing {agentName}&apos;s
          sessions
        </span>
      ) : null}
      <span className={styles.fillTools}>
        {fill.tools}
        <button
          ref={exitRef}
          type="button"
          className={clsx(styles.iconButton, styles.fillExit)}
          onClick={fill.onExit}
          aria-label="Exit fullscreen"
          title="Exit fullscreen (Esc)"
        >
          <Icon name="fullscreenExit" />
        </button>
      </span>
    </div>
  );
};

const isEditable = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement);
