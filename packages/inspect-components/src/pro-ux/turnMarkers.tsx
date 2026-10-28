import { createContext, FC, useContext, useMemo } from "react";

import type { TimelineSpan } from "../transcript/timeline/core";
import { computeBarPosition } from "../transcript/timeline/swimlaneLayout";
import type { TimeMapping } from "../transcript/timeline/timeMapping";
import { EventNode } from "../transcript/types";

import { kKindColour, kKindLabel, kKindOrder } from "./kinds";
import {
  buildKindSpans,
  formatElapsed,
  layoutKindSpans,
  type SpanLayout,
} from "./kindSpans";
import { useHtmlFlag } from "./useHtmlFlag";

interface TurnMarkersValue {
  turns: EventNode[];
  onSelect: (eventId: string) => void;
}

export const TurnMarkersContext = createContext<TurnMarkersValue | null>(null);

/** The transcript events the time bar draws. Spans are built beside the bar,
 *  where the timeline says when scoring began. */
export const useTurnMarks = (eventNodes: EventNode[]): EventNode[] =>
  eventNodes;

interface TurnMarkersProps {
  root: TimelineSpan;
  mapping?: TimeMapping;
}

/** Start of the scorers span; the event tree has already dropped it. */
const scoringStart = (span: TimelineSpan): number | undefined => {
  let start: number | undefined;
  for (const item of span.content) {
    if (item.type !== "span") continue;
    const found =
      item.spanType === "scorers"
        ? item.startTime().getTime()
        : scoringStart(item);
    if (found !== undefined) start = Math.min(start ?? found, found);
  }
  return start;
};

const useKindLayout = (
  root: TimelineSpan,
  mapping?: TimeMapping
): { layout: SpanLayout; onSelect: (id: string) => void } | null => {
  const value = useContext(TurnMarkersContext);
  const enabled = useHtmlFlag("data-pro-turnmarkers");
  const nodes = value?.turns;
  const layout = useMemo(() => {
    if (!nodes) return null;
    const spans = buildKindSpans(nodes, scoringStart(root));
    if (spans.length === 0) return null;
    const toPercent = (ms: number): number => {
      const at = new Date(ms);
      return mapping
        ? mapping.toPercent(at)
        : computeBarPosition(at, at, root.startTime(), root.endTime()).left;
    };
    return layoutKindSpans(spans, toPercent);
  }, [nodes, mapping, root]);
  if (!value || !enabled || !layout) return null;
  return { layout, onSelect: value.onSelect };
};

/** Coloured spans on the minimap track, one per stretch of the transcript;
 *  click scrolls there. */
export const TurnMarkers: FC<TurnMarkersProps> = ({ root, mapping }) => {
  const placed = useKindLayout(root, mapping);
  if (!placed) return null;
  const { layout, onSelect } = placed;
  const where =
    layout.axis === "order" ? " (placed by order, width by text length)" : "";
  return (
    <>
      {layout.spans.map((span, i) => (
        <button
          key={`${span.id}-${span.kind}-${i}`}
          type="button"
          className={`pro-kind-span pro-kind-${span.kind}`}
          style={{
            left: `${span.left}%`,
            width: `${span.width}%`,
            background: kKindColour[span.kind],
          }}
          title={span.label + where}
          aria-label={`Jump to ${span.label}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onSelect(span.id)}
        />
      ))}
    </>
  );
};

/** Swatch key for the kinds on the bar, and which axis places them. */
export const TurnKey: FC<TurnMarkersProps> = ({ root, mapping }) => {
  const placed = useKindLayout(root, mapping);
  if (!placed) return null;
  const { layout } = placed;
  const present = new Set(layout.spans.map((s) => s.kind));
  const [axis, why] =
    layout.axis === "time"
      ? ["by time", "Spans placed by wall-clock time"]
      : [
          "by order · width ∝ text length",
          `Every agent turn started within ${formatElapsed(layout.agentSpreadMs)} (a replay, or a scorer that dwarfs the run), so time would stack them in one sliver. Spans are placed in transcript order instead, each as wide as its text.`,
        ];
  return (
    <div className="pro-kind-key" aria-label="Time bar key">
      {kKindOrder
        .filter((kind) => present.has(kind))
        .map((kind) => (
          <span key={kind} className="pro-kind-key-item">
            <span
              className="pro-kind-swatch"
              style={{ background: kKindColour[kind] }}
            />
            {kKindLabel[kind]}
          </span>
        ))}
      <span className="pro-kind-key-axis" title={why}>
        {axis}
      </span>
    </div>
  );
};
