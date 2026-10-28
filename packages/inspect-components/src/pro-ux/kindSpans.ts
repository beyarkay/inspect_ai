import { formatTime } from "@tsmono/util";

import { EventNode } from "../transcript/types";

import type { SpanKind } from "./kinds";
import { argumentPreview } from "./outline";

/** One stretch of a transcript, in transcript order. */
export interface KindSpan {
  /** Event node to scroll to on click. */
  id: string;
  kind: SpanKind;
  /** Epoch milliseconds. */
  start: number;
  end: number;
  /** Characters of text, used to size spans when time is no use. */
  size: number;
  /** 1-based model call this span belongs to; 0 before the first. */
  turn: number;
  label: string;
}

export interface PlacedSpan extends KindSpan {
  /** Percent of the bar. */
  left: number;
  width: number;
}

export type SpanAxis = "time" | "order";

export interface SpanLayout {
  axis: SpanAxis;
  spans: PlacedSpan[];
  /** Milliseconds between the first and last agent span starts. */
  agentSpreadMs: number;
}

const textOfContent = (
  content: unknown,
  type: "text" | "reasoning"
): string => {
  if (typeof content === "string") return type === "text" ? content : "";
  if (!Array.isArray(content)) return "";
  let out = "";
  for (const part of content as unknown[]) {
    if (!part || typeof part !== "object" || !("type" in part)) continue;
    if (part.type !== type) continue;
    const value =
      type === "text"
        ? "text" in part && part.text
        : "reasoning" in part && part.reasoning;
    if (typeof value === "string") out += value;
  }
  return out;
};

const resultLength = (result: unknown): number => {
  if (typeof result === "string") return result.length;
  if (typeof result === "number" || typeof result === "boolean")
    return String(result).length;
  if (Array.isArray(result)) return textOfContent(result, "text").length;
  return result ? JSON.stringify(result).length : 0;
};

const ms = (stamp: string | null | undefined): number | undefined => {
  if (!stamp) return undefined;
  const value = new Date(stamp).getTime();
  return Number.isNaN(value) ? undefined : value;
};

export const formatElapsed = (elapsed: number): string => {
  if (elapsed < 1000) return `${Math.round(elapsed)} ms`;
  if (elapsed < 60_000) return `${(elapsed / 1000).toFixed(1)} sec`;
  return formatTime(elapsed / 1000);
};

const isScoringSpan = (node: EventNode): boolean =>
  node.event.event === "span_begin" &&
  (node.event.type === "scorers" || node.event.type === "scorer");

/** Every model call, tool call, prompt, score and error, in transcript order.
 *  Events from `scoringStart` on, or inside a scorer span, count as scoring. */
export const buildKindSpans = (
  eventNodes: EventNode[],
  scoringStart?: number
): KindSpan[] => {
  const spans: KindSpan[] = [];
  const seenPrompts = new Set<string>();
  let turn = 0;

  const push = (span: Omit<KindSpan, "label">, label: string): void => {
    spans.push({ ...span, label });
  };

  const visit = (nodes: EventNode[], inScorer: boolean): void => {
    for (const node of nodes) {
      const event = node.event;
      const start = ms(event.timestamp);
      const scoring =
        inScorer ||
        (scoringStart !== undefined &&
          start !== undefined &&
          start >= scoringStart);
      if (event.event === "span_begin") {
        visit(node.children, scoring || isScoringSpan(node));
        continue;
      }
      if (start === undefined) {
        visit(node.children, scoring);
        continue;
      }
      const completed =
        "completed" in event && typeof event.completed === "string"
          ? event.completed
          : undefined;
      const end = Math.max(start, ms(completed) ?? start);

      if (event.event === "model") {
        const message = event.output.choices[0]?.message;
        const reasoning = textOfContent(message?.content, "reasoning").length;
        const calls = JSON.stringify(
          message?.tool_calls?.map((c) => c.arguments) ?? []
        );
        const answer =
          textOfContent(message?.content, "text").length +
          (message?.tool_calls?.length ? calls.length : 0);
        if (scoring) {
          push(
            {
              id: node.id,
              kind: "score",
              start,
              end,
              size: reasoning + answer,
              turn,
            },
            `scorer model call · ${event.model}`
          );
          continue;
        }
        turn += 1;
        for (const input of event.input) {
          if (input.role !== "system" && input.role !== "user") continue;
          const text = textOfContent(input.content, "text");
          const key = input.id ?? `${input.role}:${text}`;
          if (seenPrompts.has(key)) continue;
          seenPrompts.add(key);
          push(
            {
              id: node.id,
              kind: input.role,
              start,
              end: start,
              size: text.length,
              turn,
            },
            `${input.role === "system" ? "system prompt" : "user message"} · ${text.length.toLocaleString()} characters`
          );
        }
        const usage = event.output.usage;
        const reasoningTokens = usage?.reasoning_tokens ?? 0;
        const outputTokens = usage?.output_tokens ?? 0;
        const reasoningShare =
          reasoning === 0 && reasoningTokens === 0
            ? 0
            : answer === 0 && outputTokens <= reasoningTokens
              ? 1
              : outputTokens > reasoningTokens && reasoningTokens > 0
                ? reasoningTokens / outputTokens
                : reasoning / (reasoning + answer);
        const split = start + (end - start) * reasoningShare;
        if (reasoningShare > 0) {
          const span = {
            id: node.id,
            kind: "reasoning" as const,
            start,
            end: split,
            size: reasoning,
            turn,
          };
          push(
            span,
            `turn ${turn} · reasoning · ${formatElapsed(span.end - span.start)}`
          );
        }
        if (reasoningShare < 1) {
          const span = {
            id: node.id,
            kind: "assistant" as const,
            start: split,
            end,
            size: answer,
            turn,
          };
          const called = message?.tool_calls?.map((c) => c.function) ?? [];
          push(
            span,
            `turn ${turn} · ${called.length ? `response, calls ${called.join(", ")}` : "response"} · ${formatElapsed(span.end - span.start)}`
          );
        }
      } else if (event.event === "tool") {
        const span = {
          id: node.id,
          kind: scoring
            ? ("score" as const)
            : event.error
              ? ("error" as const)
              : ("tool" as const),
          start,
          end,
          size:
            JSON.stringify(event.arguments).length + resultLength(event.result),
          turn,
        };
        const preview = argumentPreview(event.arguments);
        push(
          span,
          `turn ${turn} · tool ${event.function}${preview ? `: ${preview}` : ""} · ${formatElapsed(span.end - span.start)}${event.error ? ` · error: ${event.error.message}` : ""}`
        );
      } else if (event.event === "score") {
        push(
          { id: node.id, kind: "score", start, end: start, size: 0, turn },
          `score ${JSON.stringify(event.score.value)}`
        );
      } else if (event.event === "error") {
        push(
          { id: node.id, kind: "error", start, end: start, size: 0, turn },
          `error · ${event.error.message}`
        );
      }
      visit(node.children, scoring);
    }
  };

  visit(eventNodes, false);
  return spans;
};

/** Agent spans packed into less than this share of the bar read as one blob. */
const kMinAgentSpreadPct = 10;

/** Smallest share of the bar a span gets when laid out by order. */
const kMinOrderWidthPct = 0.8;

/** Place spans by time; when the agent's own spans would crowd into one
 *  sliver (a replay, or a scorer that dwarfs the run), place them in order
 *  with widths by text length instead. */
export const layoutKindSpans = (
  spans: KindSpan[],
  toPercent: (ms: number) => number
): SpanLayout => {
  const clamp = (pct: number): number => Math.min(100, Math.max(0, pct));
  const agent = spans.filter((s) => s.kind !== "score");
  const agentStarts = agent.map((s) => s.start);
  const agentSpreadMs =
    agent.length > 0 ? Math.max(...agentStarts) - Math.min(...agentStarts) : 0;
  const agentSpreadPct =
    agent.length > 0
      ? clamp(toPercent(Math.max(...agentStarts))) -
        clamp(toPercent(Math.min(...agentStarts)))
      : 100;

  if (agent.length < 3 || agentSpreadPct >= kMinAgentSpreadPct) {
    return {
      axis: "time",
      agentSpreadMs,
      spans: spans.map((s) => {
        const left = clamp(toPercent(s.start));
        return {
          ...s,
          left,
          width: Math.max(0, clamp(toPercent(s.end)) - left),
        };
      }),
    };
  }

  const minWidth = Math.min(kMinOrderWidthPct, 60 / spans.length);
  const total = spans.reduce((sum, s) => sum + s.size, 0);
  const free = 100 - minWidth * spans.length;
  let left = 0;
  return {
    axis: "order",
    agentSpreadMs,
    spans: spans.map((s) => {
      const width =
        minWidth + (total > 0 ? (free * s.size) / total : free / spans.length);
      const placed = { ...s, left, width };
      left += width;
      return placed;
    }),
  };
};
