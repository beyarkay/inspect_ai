import clsx from "clsx";
import { FC, RefObject, useRef, useState } from "react";

import type { Event } from "@tsmono/inspect-common/types";
import {
  useAnimationFrameLoop,
  useEventListener,
  useSpaceBelow,
  useUnmount,
} from "@tsmono/react/hooks";

import type { StoreCast } from "./asciicast";
import { ExpandedTerminal } from "./ExpandedTerminal";
import { PlayerSync } from "./playerSync";
import { TerminalControls } from "./TerminalControls";
import {
  allocateRows,
  buildTerminalSample,
  focusAt,
  lastCommandAt,
  localTime,
  playbackToReal,
  realToPlayback,
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

// Until a player has drawn and its line height can be measured.
const kDefaultLineHeight = 19.5;
const kMinViewHeight = 420;
const kStagePaddingTop = 14;
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
  const [timelineFold, setTimelineFold] = useState<TimelineFold>("auto");
  const [lineHeight, setLineHeight] = useState(kDefaultLineHeight);
  const [pinned, setPinned] = useState<ReadonlySet<string>>(new Set());
  const [expanded, setExpanded] = useState<{
    session: TerminalSession;
    startAt: number;
  }>();

  // The clock's source of truth: the frame loop and scrubs advance it between
  // renders, so it can't wait on state.
  const clockRef = useRef(0);
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

  useAnimationFrameLoop((elapsed) => {
    setClock(clockRef.current + elapsed * speed);
    if (clockRef.current >= sample.playbackDuration) setPlaying(false);
  }, playing);

  const real = playbackToReal(sample, playback);
  const ended = playback >= sample.playbackDuration;
  const agentFocus = focusAt(agent, real);
  const heldSession = agent.sessions.find(
    (session) => session.key === held && sessionPhase(session, real) === "open"
  );
  const focusKey = heldSession?.key ?? agentFocus;
  const states = rowStates(agent.sessions, real, focusKey, folded);

  const viewHeight = Math.max(space, kMinViewHeight);
  const timelineHeight =
    kTimelineBaseHeight + agent.sessions.length * kTimelineLaneHeight;
  const allocation = allocateRows({
    rows: agent.sessions.map((session) => ({
      key: session.key,
      state: states.get(session.key) ?? "pending",
      lastCommandAt: lastCommandAt(agent.commands, session.key, real)?.at,
    })),
    stageHeight:
      viewHeight - kFoldedControlsHeight - timelineHeight - kStagePaddingTop,
    foldGain: timelineHeight,
    lineHeight,
    timeline: timelineFold,
  });

  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
    } else {
      if (ended) setClock(0);
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
    if (e.key === " " && !onButton) {
      e.preventDefault();
      togglePlay();
    } else if (e.key === "f" || e.key === "F") {
      follow();
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      holdAdjacent(e.key === "ArrowUp" ? -1 : 1);
    }
  };
  // The tab only mounts this view while it's selected, so the document is
  // the view's own while it listens.
  useEventListener(document, "keydown", onKey);

  const heldName = heldSession?.name;
  const agentName = agent.sessions.find(
    (session) => session.key === agentFocus
  )?.name;

  return (
    <div ref={rootRef} className={styles.view} style={{ height: viewHeight }}>
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
        timelineFolded={allocation.timelineFolded}
        onToggleTimeline={() =>
          setTimelineFold(allocation.timelineFolded ? "unfolded" : "folded")
        }
        foldedTimeline={
          allocation.timelineFolded ? (
            <FoldedTimeline
              sample={sample}
              agent={agent}
              real={real}
              focusKey={focusKey}
              onScrub={setClock}
              onSeekCommand={seekToCommand}
            />
          ) : undefined
        }
      >
        {allocation.timelineFolded ? null : (
          <TerminalTimeline
            sample={sample}
            agent={agent}
            real={real}
            focusKey={focusKey}
            agentFocusKey={agentFocus}
            onScrub={setClock}
            onHold={hold}
            onSeekCommand={seekToCommand}
          />
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
