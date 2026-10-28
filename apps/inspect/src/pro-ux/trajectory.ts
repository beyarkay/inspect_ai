import type { EvalSample } from "@tsmono/inspect-common/types";
import type { SpanKind } from "@tsmono/inspect-components/pro-ux";

export type TrajectoryAxisName = "tokens" | "seconds";

export interface TrajectorySpan {
  kind: SpanKind;
  start: number;
  end: number;
  label: string;
}

export interface TrajectoryAxis {
  spans: TrajectorySpan[];
  total: number;
}

export interface TrajectoryDigest {
  tokens: TrajectoryAxis;
  seconds: TrajectoryAxis;
  error?: string;
}

export const kCharsPerToken = 4;

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null
    ? Reflect.get(value, key)
    : undefined;

const str = (value: unknown): string =>
  typeof value === "string" ? value : "";

const num = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

const partsOf = (content: unknown): unknown[] => {
  if (typeof content === "string") return [{ type: "text", text: content }];
  return Array.isArray(content) ? (content as unknown[]) : [];
};

const textOf = (content: unknown): string =>
  partsOf(content)
    .map((p) => (field(p, "type") === "text" ? str(field(p, "text")) : ""))
    .join("\n");

const preview = (text: string): string => {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
};

const tokensLabel = (n: number): string => `≈${n.toLocaleString()} tokens`;

/** Every message of the conversation in order, each as wide as its text
 *  (characters ÷ 4 ≈ tokens). Tool calls and their results are "tool";
 *  results flagged as errors are "error". */
export const tokenSpans = (
  messages: EvalSample["messages"]
): TrajectoryAxis => {
  const spans: TrajectorySpan[] = [];
  let at = 0;
  const push = (kind: SpanKind, text: string, what: string): void => {
    if (text.length === 0) return;
    const width = Math.ceil(text.length / kCharsPerToken);
    const gist = preview(text);
    spans.push({
      kind,
      start: at,
      end: at + width,
      label: `${what} · ${tokensLabel(width)}${gist ? `\n${gist}` : ""}`,
    });
    at += width;
  };
  for (const message of messages) {
    switch (message.role) {
      case "system":
        push("system", textOf(message.content), "system prompt");
        break;
      case "user":
        push("user", textOf(message.content), "user");
        break;
      case "assistant": {
        for (const part of partsOf(message.content)) {
          const type = field(part, "type");
          if (type === "reasoning") {
            const text = field(part, "redacted")
              ? str(field(part, "summary"))
              : str(field(part, "reasoning"));
            push("reasoning", text, "assistant reasoning");
          } else if (type === "text") {
            push("assistant", str(field(part, "text")), "assistant response");
          } else if (type === "tool_use") {
            push(
              "tool",
              str(field(part, "arguments")) + str(field(part, "result")),
              `tool call: ${str(field(part, "name")) || "tool"}`
            );
          }
        }
        for (const call of message.tool_calls ?? []) {
          push(
            "tool",
            JSON.stringify(call.arguments),
            `tool call: ${call.function}`
          );
        }
        break;
      }
      case "tool": {
        const failed = Boolean(message.error);
        push(
          failed ? "error" : "tool",
          textOf(message.content) || (message.error?.message ?? ""),
          `${failed ? "tool error" : "tool result"}: ${message.function ?? "tool"}`
        );
        break;
      }
    }
  }
  return { spans, total: at };
};

interface TimedEvent {
  event: string;
  timestamp?: unknown;
  completed?: unknown;
  working_time?: unknown;
  id?: unknown;
  type?: unknown;
  model?: unknown;
  function?: unknown;
  output?: unknown;
  error?: unknown;
}

const reasoningShare = (e: TimedEvent): number => {
  const usage = field(e.output, "usage");
  const reasoning = num(field(usage, "reasoning_tokens"));
  const output = num(field(usage, "output_tokens"));
  if (reasoning > 0 && output > 0) return Math.min(1, reasoning / output);
  const choices = field(e.output, "choices");
  const first: unknown = Array.isArray(choices) ? choices[0] : undefined;
  let thought = 0;
  let said = 0;
  for (const part of partsOf(field(field(first, "message"), "content"))) {
    const type = field(part, "type");
    if (type === "reasoning") thought += str(field(part, "reasoning")).length;
    else if (type === "text") said += str(field(part, "text")).length;
  }
  return thought + said > 0 ? thought / (thought + said) : 0;
};

const seconds = (s: number): string =>
  s < 10 ? `${s.toFixed(2)} s` : `${s.toFixed(1)} s`;

/** Wall-clock layout from the event log: model calls (split into reasoning
 *  and response by their share of output tokens), tool calls, and the
 *  scoring span. Gaps are time spent elsewhere. */
export const secondSpans = (events: readonly TimedEvent[]): TrajectoryAxis => {
  const ms = (value: unknown): number => {
    const text = str(value);
    return text ? Date.parse(text) : NaN;
  };
  const starts = events.map((e) => ms(e.timestamp)).filter(Number.isFinite);
  if (starts.length === 0) return { spans: [], total: 0 };
  const origin = Math.min(...starts);
  const spans: TrajectorySpan[] = [];
  const scoring = new Map<string, number>();
  let last = origin;
  const push = (kind: SpanKind, from: number, to: number, what: string) => {
    if (!Number.isFinite(from)) return;
    const end = Number.isFinite(to) ? Math.max(to, from) : from;
    last = Math.max(last, end);
    spans.push({
      kind,
      start: (from - origin) / 1000,
      end: (end - origin) / 1000,
      label: `${what} · ${seconds((end - from) / 1000)}`,
    });
  };
  const endOf = (e: TimedEvent, from: number): number =>
    e.completed ? ms(e.completed) : from + num(e.working_time) * 1000;
  for (const e of events) {
    const from = ms(e.timestamp);
    const id = str(e.id);
    if (Number.isFinite(from)) last = Math.max(last, from);
    if (e.event === "span_begin" && e.type === "scorers" && id) {
      scoring.set(id, from);
    } else if (e.event === "span_end" && scoring.has(id)) {
      push("score", scoring.get(id) ?? from, from, "scoring");
      scoring.delete(id);
    } else if (scoring.size > 0) {
      continue;
    } else if (e.event === "model") {
      const to = endOf(e, from);
      const split = from + (to - from) * reasoningShare(e);
      const model = str(e.model) || "model";
      if (split > from) push("reasoning", from, split, `${model} reasoning`);
      if (to > split || split === from) {
        push("assistant", split, to, `${model} response`);
      }
    } else if (e.event === "tool") {
      const failed = Boolean(e.error);
      push(
        failed ? "error" : "tool",
        from,
        endOf(e, from),
        `${failed ? "tool error" : "tool call"}: ${str(e.function) || "tool"}`
      );
    } else if (e.event === "error") {
      push("error", from, from, `error: ${str(field(e.error, "message"))}`);
    }
  }
  for (const from of scoring.values()) push("score", from, last, "scoring");
  return { spans, total: (last - origin) / 1000 };
};

export const digestSample = (sample: EvalSample): TrajectoryDigest => ({
  tokens: tokenSpans(sample.messages),
  seconds: secondSpans(sample.events),
  error: sample.error?.message ?? undefined,
});

/** The one input every row shares, or undefined when they differ. */
export const sharedInput = (
  inputs: readonly (string | undefined)[]
): string | undefined => {
  if (inputs.length < 2) return undefined;
  const first = inputs[0];
  if (!first) return undefined;
  return inputs.every((input) => input === first) ? first : undefined;
};

export const formatAxisTotal = (
  axis: TrajectoryAxisName,
  total: number
): string => {
  if (axis === "seconds") {
    return total < 10 ? `${total.toFixed(1)} s` : `${Math.round(total)} s`;
  }
  if (total >= 10_000) return `≈${Math.round(total / 1000)}k`;
  if (total >= 1000) return `≈${(total / 1000).toFixed(1)}k`;
  return `≈${Math.round(total)}`;
};
