import { createContext, FC, useContext, useMemo } from "react";

import type { TimelineSpan } from "../transcript/timeline/core";
import { computeBarPosition } from "../transcript/timeline/swimlaneLayout";
import type { TimeMapping } from "../transcript/timeline/timeMapping";
import { flatTree } from "../transcript/transform/flatten";
import { EventNode } from "../transcript/types";

import { useHtmlFlag } from "./useHtmlFlag";

export interface TurnMark {
  id: string;
  time: Date;
  label: string;
}

interface TurnMarkersValue {
  turns: TurnMark[];
  onSelect: (eventId: string) => void;
}

export const TurnMarkersContext = createContext<TurnMarkersValue | null>(null);

/** One mark per model call, in transcript order. */
export const useTurnMarks = (eventNodes: EventNode[]): TurnMark[] =>
  useMemo(() => {
    const marks: TurnMark[] = [];
    for (const node of flatTree(eventNodes, null)) {
      if (node.event.event !== "model" || !node.event.timestamp) continue;
      marks.push({
        id: node.id,
        time: new Date(node.event.timestamp),
        label: `turn ${marks.length + 1} · ${node.event.model}`,
      });
    }
    return marks;
  }, [eventNodes]);

interface TurnMarkersProps {
  root: TimelineSpan;
  mapping?: TimeMapping;
}

/** Below this spread (in % of the bar) time positions are indistinguishable. */
const kMinSpread = 2;

/** Ticks on the minimap track, one per model call; click scrolls there.
 *  When every turn lands within kMinSpread of the bar (e.g. a replay), the
 *  ticks are spaced by order instead, drawn dashed, and say so. */
export const TurnMarkers: FC<TurnMarkersProps> = ({ root, mapping }) => {
  const value = useContext(TurnMarkersContext);
  const enabled = useHtmlFlag("data-pro-turnmarkers");
  if (!value || !enabled || value.turns.length === 0) return null;
  const byTime = value.turns.map((turn) =>
    Math.min(
      100,
      Math.max(
        0,
        mapping
          ? mapping.toPercent(turn.time)
          : computeBarPosition(
              turn.time,
              turn.time,
              root.startTime(),
              root.endTime()
            ).left
      )
    )
  );
  const spread = Math.max(...byTime) - Math.min(...byTime);
  const byOrder = value.turns.length > 1 && spread < kMinSpread;
  const first = value.turns[0]?.time.getTime() ?? 0;
  const last = value.turns[value.turns.length - 1]?.time.getTime() ?? 0;
  const note = byOrder
    ? ` (all turns started within ${last - first} ms; ticks spaced by order, not time)`
    : "";
  return (
    <>
      {value.turns.map((turn, i) => (
        <button
          key={turn.id}
          type="button"
          className={
            byOrder ? "pro-turn-mark pro-turn-mark-order" : "pro-turn-mark"
          }
          style={{
            left: `${byOrder ? ((i + 0.5) / value.turns.length) * 100 : byTime[i]}%`,
          }}
          title={turn.label + note}
          aria-label={`Jump to ${turn.label}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => value.onSelect(turn.id)}
        />
      ))}
    </>
  );
};
