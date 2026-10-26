import clsx from "clsx";
import { FC, RefObject, useRef, useState } from "react";

import type { Event } from "@tsmono/inspect-common/types";
import {
  useAnimationFrameLoop,
  useEventListener,
  useSpaceBelow,
  useUnmount,
} from "@tsmono/react/hooks";

import { commandLabel, type StoreCast } from "./asciicast";
import { ExpandedTerminal } from "./ExpandedTerminal";
import { PlayerSync } from "./playerSync";
import { TerminalControls } from "./TerminalControls";
import {
  adjacentCommand,
  allocateRows,
  buildTerminalSample,
  focusAt,
  idleGapAt,
  kSharedIdleLimit,
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
  type TerminalSession,
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
// The idle chip appears this long (seconds) into a skipped gap, and lingers
// this long (ms) after it.
const kIdleChipDelay = 0.12;
const kIdleChipLinger = 1000;
// Gaps that skip less real time than this (seconds) don't raise the chip.
const kIdleChipMinSkip = 5;
// Until a player has drawn and its line height can be measured.
const kDefaultLineHeight = 19.5;
const kMinViewHeight = 420;
// The stage's vertical padding (see Terminals.module.css).
const kStagePadding = 24;
// Control row heights (see Terminals.module.css): the folded row, and what
// each timeline lane adds when unfolded.
const kFoldedControlsHeight = 51;
const kTimelineBaseHeight = 30;
const kTimelineLaneHeight = 18;

interface TerminalsViewProps {
  id: string;
  casts: StoreCast[];
  events?: Event[];
  /** The sample's scroll container; the view fills its visible height. */
  scrollRef: RefObject<HTMLDivElement | null>;
}

/**
 * Every terminal session of a sample, stacked full width and driven by one
 * master clock: idle time is shortened only while every terminal is idle, the
 * agent's active session gets the rows, and a timeline below shows each
 * session's lifetime, focus and commands. (Design brief:
 * design/inspect-multiterminal-design-brief in inspect_ai.)
 */
export const TerminalsView: FC<TerminalsViewProps> = ({
  id,
  casts,
  events,
  scrollRef,
}) => {
  const sample = buildTerminalSample(casts, events);
  const agent = sample.agents[0];
  return agent ? (
    <SharedTerminals
      id={id}
      sample={sample}
      agent={agent}
      scrollRef={scrollRef}
    />
  ) : null;
};

interface SharedTerminalsProps {
  id: string;
  sample: TerminalSample;
  agent: TerminalAgent;
  scrollRef: RefObject<HTMLDivElement | null>;
}

const SharedTerminals: FC<SharedTerminalsProps> = ({
  id,
  sample,
  agent,
  scrollRef,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const space = useSpaceBelow(rootRef, scrollRef);

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
  const [idleChip, setIdleChip] = useState<{
    skipped: number;
    visible: boolean;
  }>();
  // While playing, the agent's focus as the stage shows it: switches closer
  // together than kFocusSwitchMs collapse, so rapid switching doesn't thrash
  // the layout.
  const [playingFocus, setPlayingFocus] = useState<string>();
  const [lineHeight, setLineHeight] = useState(kDefaultLineHeight);
  const [pinned, setPinned] = useState<ReadonlySet<string>>(new Set());
  const [expanded, setExpanded] = useState<{
    session: TerminalSession;
    startAt: number;
  }>();

  // The clock's source of truth: the frame loop and scrubs advance it between
  // renders, so it can't wait on state.
  const clockRef = useRef(0);
  const lastSwitchRef = useRef(0);
  const idleSeenRef = useRef(0);
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

    // The idle chip shows once a skipped gap has played for a moment, counts
    // the real time skipped so far, and lingers briefly after the gap.
    const gap = idleGapAt(sample, clockReal);
    const into = gap ? clockRef.current - realToPlayback(sample, gap.start) : 0;
    if (
      gap &&
      gap.end - gap.start - kSharedIdleLimit >= kIdleChipMinSkip &&
      into / speed >= kIdleChipDelay
    ) {
      idleSeenRef.current = now;
      setIdleChip({ skipped: clockReal - gap.start - into, visible: true });
    } else if (
      idleChip?.visible &&
      now - idleSeenRef.current > kIdleChipLinger
    ) {
      setIdleChip({ ...idleChip, visible: false });
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

  const viewHeight = Math.max(space, kMinViewHeight);
  const timelineHeight =
    kTimelineBaseHeight + agent.sessions.length * kTimelineLaneHeight;
  const allocate = (timeline: TimelineFold) =>
    allocateRows({
      rows: agent.sessions.map((session) => ({
        key: session.key,
        state: states.get(session.key) ?? "pending",
        lastCommandAt: lastCommandAt(agent.commands, session.key, real)?.at,
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
      setIdleChip(undefined);
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

  const expand = (session: TerminalSession) => {
    setPlaying(false);
    setExpanded({ session, startAt: localTime(session, real) });
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

  const onKey = (e: KeyboardEvent) => {
    if (
      expanded ||
      e.defaultPrevented ||
      e.altKey ||
      e.ctrlKey ||
      e.metaKey ||
      isEditable(e.target)
    ) {
      return;
    }
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
    } else if (e.key === "Enter" && !onButton) {
      const session =
        heldSession ??
        agent.sessions.find((candidate) => candidate.key === focusKey);
      if (!session) return;
      e.preventDefault();
      if (e.shiftKey) expand(session);
      else if (heldSession) toggleFold(heldSession.key);
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
  const focusCommand = focusKey
    ? lastCommandAt(agent.commands, focusKey, real)
    : undefined;
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
    onScrubStart: () => setScrubbing(true),
    onHold: hold,
    onSeekCommand: seekToCommand,
  };
  const agentName = agent.sessions.find(
    (session) => session.key === agentFocus
  )?.name;

  return (
    <div
      ref={rootRef}
      className={styles.view}
      style={{ maxHeight: viewHeight }}
    >
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
              lastCommand={lastCommandAt(agent.commands, key, real)}
              snippet={
                state === "folded" || state === "closed"
                  ? resultSnippet(session, real)
                  : undefined
              }
              animate={playing}
              pulse={
                playing &&
                heldSession !== undefined &&
                (lastCommandAt(agent.commands, key, real)?.at ?? -1) >=
                  pulseSince
              }
              onHold={() => hold(key)}
              onToggleFold={() => toggleFold(key)}
              onExpand={() => expand(session)}
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
        idleSkipped={playing ? idleChip?.skipped : undefined}
        idleVisible={playing && (idleChip?.visible ?? false)}
        totalIdleSkipped={sample.duration - sample.playbackDuration}
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
            <FoldedTimeline {...timelineProps} />
          ) : undefined
        }
        peekTimeline={<TerminalTimeline {...timelineProps} />}
      >
        {allocation.timelineFolded ? null : (
          <TerminalTimeline {...timelineProps} />
        )}
      </TerminalControls>
      {expanded ? (
        <ExpandedTerminal
          id={`${id}-${expanded.session.name}-expanded`}
          session={expanded.session}
          startAt={expanded.startAt}
          speed={speed}
          onSpeedChange={setSpeed}
          onClose={() => {
            setExpanded(undefined);
          }}
        />
      ) : null}
    </div>
  );
};

const isEditable = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement);
