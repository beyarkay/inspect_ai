import type { Event, ToolEvent } from "@tsmono/inspect-common/types";

import {
  castEvents,
  castHeader,
  highlightCommandEchoes,
  kCommandMarkerOffset,
  terminalMarker,
  type StoreCast,
} from "./asciicast";

// On the shared clock a gap is shortened to this only while every terminal is
// idle (single-session playback shortens each session's own gaps).
export const kSharedIdleLimit = 2;

export const kPlaybackSpeeds = [1, 2, 4];

// A cast marker and the tool call that wrote it are stamped by different
// clocks (and the cast start is whole seconds), so they join within a window.
const kToolEventJoinWindow = 5;

export interface TerminalSession {
  /** Store key; the session's identity. */
  key: string;
  /** The terminal tool's session name. */
  name: string;
  /** The cast with command echoes styled, as the players show it. */
  cast: string;
  rows: number;
  cols: number;
  /** Real seconds from the sample's terminal origin. */
  start: number;
  end: number;
  agentId: string;
  /** Output events, in local (session) seconds. */
  output: { time: number; data: string }[];
}

export interface TerminalCommand {
  sessionKey: string;
  command: string;
  /** When the command was sent (real seconds). */
  sentAt: number;
  /** When its echo has drawn (real seconds): focus moves here, and seeking
   *  here shows the command. */
  at: number;
  toolCallId?: string;
  eventUuid?: string;
}

export interface TerminalActivity {
  action: "open" | "read";
  sessionKey: string;
  at: number;
  toolCallId?: string;
  eventUuid?: string;
}

export interface FocusSegment {
  sessionKey: string;
  start: number;
  end: number;
}

export interface TerminalAgent {
  /** The `ir_agent_span_id` of its sessions; "" for casts without one. */
  id: string;
  name: string;
  sessions: TerminalSession[];
  commands: TerminalCommand[];
  focusSegments: FocusSegment[];
}

export interface TerminalSample {
  /** Epoch seconds of the earliest session start (0 without timestamps). */
  origin: number;
  /** Real seconds from origin to the last session end. */
  duration: number;
  /** [real, playback] pairs of the shared clock's piecewise-linear map. */
  knots: [number, number][];
  playbackDuration: number;
  sessions: TerminalSession[];
  commands: TerminalCommand[];
  activities: TerminalActivity[];
  agents: TerminalAgent[];
}

/**
 * Places the store casts on one real-time axis and joins their markers to the
 * transcript's terminal tool calls. Sessions are grouped into agents by their
 * `ir_agent_span_id` header field; casts without it form one group.
 */
export const buildTerminalSample = (
  casts: StoreCast[],
  events: Event[] = []
): TerminalSample => {
  const parsed = casts.map((storeCast) => {
    const header = castHeader(storeCast.cast);
    const castEventList = castEvents(storeCast.cast);
    const markers = castEventList.flatMap((event) => {
      const marker =
        event.type === "m" ? terminalMarker(event.data) : undefined;
      return marker ? [{ event, marker }] : [];
    });
    return { storeCast, header, events: castEventList, markers };
  });

  const timestamps = parsed.flatMap(({ header }) =>
    header.timestamp !== undefined ? [header.timestamp] : []
  );
  const origin = timestamps.length > 0 ? Math.min(...timestamps) : 0;

  const sessions = parsed
    .map(({ storeCast, header, events: castEventList, markers }) => {
      const start =
        header.timestamp !== undefined ? header.timestamp - origin : 0;
      const length = castEventList.at(-1)?.time ?? 0;
      const session: TerminalSession = {
        key: storeCast.key,
        name: header.session ?? markers[0]?.marker.session ?? storeCast.name,
        cast: highlightCommandEchoes(storeCast.cast),
        rows: header.rows,
        cols: header.cols,
        start,
        end: start + length,
        agentId: header.agentSpanId ?? "",
        output: castEventList
          .filter((event) => event.type === "o")
          .map(({ time, data }) => ({ time, data })),
      };
      return { session, header, events: castEventList, markers };
    })
    .sort(
      (a, b) =>
        a.session.start - b.session.start ||
        a.session.key.localeCompare(b.session.key)
    );

  const toolJoin = toolEventJoiner(events, origin);
  const commands: TerminalCommand[] = [];
  const activities: TerminalActivity[] = [];
  for (const { session, events: castEventList, markers } of sessions) {
    for (const { event, marker } of markers) {
      const sentAt = session.start + event.time;
      const toolEvent = toolJoin(session.name, marker.action, sentAt);
      const link = toolEvent
        ? {
            toolCallId: toolEvent.id,
            ...(toolEvent.uuid ? { eventUuid: toolEvent.uuid } : {}),
          }
        : {};
      if (marker.action === "send") {
        const echo = castEventList.find(
          (candidate) => candidate.type === "o" && candidate.time >= event.time
        );
        const nextMarker = castEventList.find(
          (candidate) => candidate.type === "m" && candidate.time > event.time
        );
        const echoed =
          echo && (!nextMarker || echo.time <= nextMarker.time)
            ? echo.time + kCommandMarkerOffset
            : event.time;
        commands.push({
          sessionKey: session.key,
          command: marker.command ?? "",
          sentAt,
          at: session.start + echoed,
          ...link,
        });
      } else {
        activities.push({
          action: marker.action,
          sessionKey: session.key,
          at: sentAt,
          ...link,
        });
      }
    }
  }
  commands.sort((a, b) => a.at - b.at);
  activities.sort((a, b) => a.at - b.at);

  const sessionList = sessions.map(({ session }) => session);
  const duration = Math.max(0, ...sessionList.map((session) => session.end));
  const knots = buildKnots(sessionList, commands, duration);

  const agentHeaders = new Map<string, string>();
  for (const { session, header } of sessions) {
    if (!agentHeaders.has(session.agentId) || header.agentName) {
      agentHeaders.set(
        session.agentId,
        header.agentName ?? agentHeaders.get(session.agentId) ?? "agent"
      );
    }
  }
  const agents = [...agentHeaders.entries()].map(([id, name]) => {
    const agentSessions = sessionList.filter(
      (session) => session.agentId === id
    );
    const keys = new Set(agentSessions.map((session) => session.key));
    const agentCommands = commands.filter((command) =>
      keys.has(command.sessionKey)
    );
    return {
      id,
      name,
      sessions: agentSessions,
      commands: agentCommands,
      focusSegments: focusSegments(agentSessions, agentCommands),
    };
  });

  return {
    origin,
    duration,
    knots,
    playbackDuration: knots.at(-1)?.[1] ?? 0,
    sessions: sessionList,
    commands,
    activities,
    agents,
  };
};

// Each terminal tool call joins at most one marker: the one of the same
// session and action nearest its start, within the join window.
const toolEventJoiner = (events: Event[], origin: number) => {
  const candidates = events.flatMap((event) => {
    if (event.event !== "tool" || event.function !== "terminal") return [];
    const session = event.arguments.session;
    const action = event.arguments.action;
    const time = Date.parse(event.timestamp) / 1000 - origin;
    return typeof session === "string" &&
      typeof action === "string" &&
      Number.isFinite(time)
      ? [{ event, session, action, time }]
      : [];
  });
  const used = new Set<ToolEvent>();
  return (
    session: string,
    action: string,
    at: number
  ): ToolEvent | undefined => {
    let best: (typeof candidates)[number] | undefined;
    for (const candidate of candidates) {
      if (
        used.has(candidate.event) ||
        candidate.session !== session ||
        candidate.action !== action ||
        Math.abs(candidate.time - at) > kToolEventJoinWindow
      ) {
        continue;
      }
      if (!best || Math.abs(candidate.time - at) < Math.abs(best.time - at)) {
        best = candidate;
      }
    }
    if (best) used.add(best.event);
    return best?.event;
  };
};

// The shared clock: over the union of every session's event times, a gap
// plays at full length unless it exceeds the idle limit, which only happens
// when no terminal does anything for that long.
const buildKnots = (
  sessions: TerminalSession[],
  commands: TerminalCommand[],
  duration: number
): [number, number][] => {
  const times = new Set<number>([0, duration]);
  for (const session of sessions) {
    times.add(session.start);
    times.add(session.end);
    for (const { time } of session.output) {
      times.add(session.start + time);
    }
  }
  for (const command of commands) {
    times.add(command.sentAt);
    times.add(command.at);
  }
  const sorted = [...times].sort((a, b) => a - b);
  const knots: [number, number][] = [];
  let playback = 0;
  let previous: number | undefined;
  for (const time of sorted) {
    if (previous !== undefined) {
      playback += Math.min(time - previous, kSharedIdleLimit);
    }
    knots.push([time, playback]);
    previous = time;
  }
  return knots;
};

/** Playback seconds on the shared clock for a real time. */
export const realToPlayback = (sample: TerminalSample, real: number): number =>
  interpolate(sample.knots, real, 0, 1);

/** Real seconds for a playback time on the shared clock. */
export const playbackToReal = (
  sample: TerminalSample,
  playback: number
): number => interpolate(sample.knots, playback, 1, 0);

const interpolate = (
  knots: [number, number][],
  x: number,
  from: 0 | 1,
  to: 0 | 1
): number => {
  const first = knots[0];
  const last = knots.at(-1);
  if (!first || !last) return 0;
  if (x <= first[from]) return first[to];
  if (x >= last[from]) return last[to];
  let lo = 0;
  let hi = knots.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if ((knots[mid]?.[from] ?? 0) <= x) lo = mid;
    else hi = mid;
  }
  const [a, b] = [knots[lo], knots[hi]];
  if (!a || !b || b[from] === a[from]) return a?.[to] ?? 0;
  return a[to] + ((x - a[from]) / (b[from] - a[from])) * (b[to] - a[to]);
};

/**
 * The shortened gap containing a real time, when every terminal is idle and
 * the shared clock is skipping: real seconds from `start` to `end` play in
 * `kSharedIdleLimit`.
 */
export const idleGapAt = (
  sample: TerminalSample,
  real: number
): { start: number; end: number } | undefined => {
  const { knots } = sample;
  for (let i = 1; i < knots.length; i++) {
    const [start = 0] = knots[i - 1] ?? [];
    const [end = 0] = knots[i] ?? [];
    if (end < real) continue;
    if (start > real) return undefined;
    return end - start > kSharedIdleLimit ? { start, end } : undefined;
  }
  return undefined;
};

export type SessionPhase = "pending" | "open" | "closed";

export const sessionPhase = (
  session: TerminalSession,
  real: number
): SessionPhase =>
  real < session.start ? "pending" : real > session.end ? "closed" : "open";

/** The player position for a real time: seconds into the session's own
 *  recording (the players don't shorten idle time). */
export const localTime = (session: TerminalSession, real: number): number =>
  Math.min(Math.max(real - session.start, 0), session.end - session.start);

/**
 * The session the agent is working in at a real time: that of its most recent
 * command whose session is still open (commands move focus once their echo
 * has drawn), else its earliest open session; undefined when none is open.
 */
export const focusAt = (
  agent: Pick<TerminalAgent, "sessions" | "commands">,
  real: number
): string | undefined => {
  const open = new Set(
    agent.sessions
      .filter((session) => sessionPhase(session, real) === "open")
      .map((session) => session.key)
  );
  for (let i = agent.commands.length - 1; i >= 0; i--) {
    const command = agent.commands[i];
    if (command && command.at <= real && open.has(command.sessionKey)) {
      return command.sessionKey;
    }
  }
  return agent.sessions.find((session) => open.has(session.key))?.key;
};

// Focus changes only at a command or when a session opens or closes, so the
// segments are focusAt evaluated between those boundaries.
const focusSegments = (
  sessions: TerminalSession[],
  commands: TerminalCommand[]
): FocusSegment[] => {
  const boundaries = [
    ...new Set([
      ...commands.map((command) => command.at),
      ...sessions.flatMap((session) => [session.start, session.end]),
    ]),
  ].sort((a, b) => a - b);
  const segments: FocusSegment[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i] ?? 0;
    const end = boundaries[i + 1] ?? start;
    if (end <= start) continue;
    const sessionKey = focusAt({ sessions, commands }, (start + end) / 2);
    const previous = segments.at(-1);
    if (sessionKey === undefined) continue;
    if (previous?.sessionKey === sessionKey && previous.end === start) {
      previous.end = end;
    } else {
      segments.push({ sessionKey, start, end });
    }
  }
  return segments;
};

/** The most recent command sent to a session at or before a real time. */
export const lastCommandAt = (
  commands: TerminalCommand[],
  sessionKey: string,
  real: number
): TerminalCommand | undefined => {
  let last: TerminalCommand | undefined;
  for (const command of commands) {
    if (command.at > real) break;
    if (command.sessionKey === sessionKey) last = command;
  }
  return last;
};

export type RowState = "focused" | "open" | "folded" | "closed" | "pending";

/** Each session's row state at a real time (brief §4.3). A held or focused
 *  session counts as focused even when the user folded it. */
export const rowStates = (
  sessions: TerminalSession[],
  real: number,
  focusKey: string | undefined,
  folded: ReadonlySet<string>
): Map<string, RowState> =>
  new Map(
    sessions.map((session) => {
      const phase = sessionPhase(session, real);
      const state: RowState =
        phase !== "open"
          ? phase
          : session.key === focusKey
            ? "focused"
            : folded.has(session.key)
              ? "folded"
              : "open";
      return [session.key, state];
    })
  );

export const kRowBarHeight = 30;
export const kRowGap = 10;
export const kRowBodyPadding = 14;
export const kTailRows = 3;
export const kMaxRows = 40;
const kFocusFoldThreshold = 16;
const kFocusFloor = 8;

export type TimelineFold = "auto" | "folded" | "unfolded";

export interface RowAllocation {
  /** Terminal rows shown in each row's body (0: bar only). */
  bodyRows: Map<string, number>;
  timelineFolded: boolean;
  /** The floors don't fit: the stage scrolls. */
  scrolls: boolean;
}

/**
 * Brief §4.4: closed rows get a bar, open tails 3 rows, the focused row the
 * rest up to 40; a focus under 16 rows folds the timeline (unless the user
 * pinned it open), and one under 8 holds at 8 and lets the stage scroll;
 * rows past the focus's 40 go to the tails, most recently commanded first.
 */
export const allocateRows = (input: {
  rows: { key: string; state: RowState; lastCommandAt?: number }[];
  /** Stage height with the timeline unfolded (padding excluded). */
  stageHeight: number;
  /** Height the stage gains when the timeline folds. */
  foldGain: number;
  lineHeight: number;
  timeline: TimelineFold;
}): RowAllocation => {
  const shown = input.rows.filter((row) => row.state !== "pending");
  const focused = shown.find((row) => row.state === "focused");
  const tails = shown.filter((row) => row.state === "open");
  const bodies = (focused ? 1 : 0) + tails.length;
  const fixed =
    shown.length * kRowBarHeight +
    Math.max(0, shown.length - 1) * kRowGap +
    bodies * kRowBodyPadding;
  const freeRows = (folded: boolean) =>
    Math.floor(
      (input.stageHeight + (folded ? input.foldGain : 0) - fixed) /
        input.lineHeight
    );

  let timelineFolded = input.timeline === "folded";
  let available = freeRows(timelineFolded);
  if (
    focused &&
    input.timeline === "auto" &&
    available - tails.length * kTailRows < kFocusFoldThreshold
  ) {
    timelineFolded = true;
    available = freeRows(true);
  }

  const bodyRows = new Map<string, number>(
    input.rows.map((row) => [row.key, 0])
  );
  for (const tail of tails) bodyRows.set(tail.key, kTailRows);
  let scrolls = false;
  if (focused) {
    let rows = available - tails.length * kTailRows;
    if (rows < kFocusFloor) {
      scrolls = true;
      rows = kFocusFloor;
    }
    const focusRows = Math.min(rows, kMaxRows);
    bodyRows.set(focused.key, focusRows);
    let extra = rows - focusRows;
    const byRecency = [...tails].sort(
      (a, b) => (b.lastCommandAt ?? -1) - (a.lastCommandAt ?? -1)
    );
    for (const tail of byRecency) {
      if (extra <= 0) break;
      const grant = Math.min(extra, kMaxRows - kTailRows);
      bodyRows.set(tail.key, kTailRows + grant);
      extra -= grant;
    }
  } else if (available < tails.length * kTailRows) {
    scrolls = tails.length > 0;
  }
  return { bodyRows, timelineFolded, scrolls };
};
