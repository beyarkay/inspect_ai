import { describe, expect, it } from "vitest";

import { EventNode } from "../transcript/types";

import { buildKindSpans, formatElapsed, layoutKindSpans } from "./kindSpans";

const at = (ms: number): string => new Date(1_000_000 + ms).toISOString();

const node = (id: string, event: object, children: EventNode[] = []) => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- partial fixtures
  const made = new EventNode(id, event as EventNode["event"], 0);
  made.children = children;
  return made;
};

const model = (
  id: string,
  start: number,
  end: number,
  opts: {
    input?: object[];
    content?: unknown;
    calls?: string[];
    reasoningTokens?: number;
    outputTokens?: number;
    messageId?: string;
  } = {}
) =>
  node(id, {
    event: "model",
    model: "test/model",
    timestamp: at(start),
    completed: at(end),
    input: opts.input ?? [],
    output: {
      usage: {
        input_tokens: 0,
        output_tokens: opts.outputTokens ?? 0,
        reasoning_tokens: opts.reasoningTokens ?? null,
      },
      choices: [
        {
          message: {
            id: opts.messageId,
            role: "assistant",
            content: opts.content ?? "ok",
            tool_calls: opts.calls?.map((fn) => ({
              id: fn,
              function: fn,
              arguments: { cmd: "ls" },
            })),
          },
        },
      ],
    },
  });

const tool = (id: string, start: number, end: number, error = false) =>
  node(id, {
    event: "tool",
    function: "bash",
    arguments: { cmd: "ls" },
    result: "file.txt",
    error: error ? { type: "unknown", message: "boom" } : null,
    timestamp: at(start),
    completed: at(end),
  });

describe("buildKindSpans", () => {
  it("emits prompts once, then reasoning, response and tool spans per turn", () => {
    const system = { role: "system", content: "be brief", id: "s" };
    const user = { role: "user", content: "hello there", id: "u" };
    const spans = buildKindSpans([
      model("m1", 0, 1000, {
        input: [system, user],
        content: [
          { type: "reasoning", reasoning: "think" },
          { type: "text", text: "doing it" },
        ],
        reasoningTokens: 30,
        outputTokens: 40,
        calls: ["bash"],
      }),
      tool("t1", 1000, 1500),
      model("m2", 1500, 2000, { input: [system, user, { role: "tool" }] }),
    ]);
    expect(spans.map((s) => `${s.kind}:${s.turn}`)).toEqual([
      "system:1",
      "user:1",
      "reasoning:1",
      "assistant:1",
      "tool:1",
      "assistant:2",
    ]);
    const [, , reasoning, answer] = spans;
    expect(reasoning?.end).toBe(new Date(at(750)).getTime());
    expect(answer?.start).toBe(reasoning?.end);
    expect(answer?.label).toContain("calls bash");
  });

  it("points each model-call span at its own message and part", () => {
    const user = { role: "user", content: "hello", id: "u" };
    const unnamed = { role: "user", content: "no id" };
    const spans = buildKindSpans([
      model("m1", 0, 1000, {
        input: [user, unnamed],
        content: [
          { type: "reasoning", reasoning: "think" },
          { type: "text", text: "done" },
        ],
        messageId: "out",
      }),
      tool("t1", 1000, 1500),
      model("m2", 1500, 2000),
    ]);
    expect(spans.map((s) => [s.kind, s.id, s.target])).toEqual([
      ["user", "m1", { messageId: "u" }],
      ["user", "m1", undefined],
      ["reasoning", "m1", { messageId: "out", part: "reasoning" }],
      ["assistant", "m1", { messageId: "out", part: "response" }],
      ["tool", "t1", undefined],
      ["assistant", "m2", undefined],
    ]);
  });

  it("marks everything under a scorer span as scoring and failed tools as errors", () => {
    const spans = buildKindSpans([
      tool("t1", 0, 10, true),
      node(
        "sc",
        {
          event: "span_begin",
          type: "scorer",
          name: "judge",
          timestamp: at(20),
        },
        [
          model("m9", 20, 9000),
          node("s", {
            event: "score",
            score: { value: 61 },
            timestamp: at(9000),
          }),
        ]
      ),
    ]);
    expect(spans.map((s) => s.kind)).toEqual(["error", "score", "score"]);
    expect(spans[2]?.label).toBe("score 61");
  });
});

describe("buildKindSpans with a scoring start", () => {
  it("counts events from the scoring start as scoring, without a span", () => {
    const judge = { role: "user", content: "rate this", id: "j" };
    const spans = buildKindSpans(
      [model("m1", 0, 10), model("m9", 50, 900, { input: [judge] })],
      new Date(at(50)).getTime()
    );
    expect(spans.map((s) => `${s.kind}:${s.turn}`)).toEqual([
      "assistant:1",
      "score:1",
    ]);
  });
});

describe("layoutKindSpans", () => {
  const linear = (ms: number): number => ((ms - 1_000_000) / 10_000) * 100;

  it("keeps time when the agent's spans spread across the bar", () => {
    const spans = buildKindSpans([
      model("m1", 0, 3000),
      tool("t1", 3000, 5000),
      model("m2", 5000, 9000),
    ]);
    const layout = layoutKindSpans(spans, linear);
    expect(layout.axis).toBe("time");
    expect(layout.spans.map((s) => [s.left, s.width])).toEqual([
      [0, 30],
      [30, 20],
      [50, 40],
    ]);
  });

  it("falls back to order with widths by text when time crowds the agent", () => {
    const spans = buildKindSpans([
      model("m1", 0, 1, { content: "a".repeat(100) }),
      tool("t1", 1, 2),
      model("m2", 2, 3, { content: "b".repeat(300) }),
      node(
        "sc",
        { event: "span_begin", type: "scorers", name: "s", timestamp: at(3) },
        [model("m9", 3, 10_000, { content: "c".repeat(10) })]
      ),
    ]);
    const layout = layoutKindSpans(spans, linear);
    expect(layout.axis).toBe("order");
    expect(layout.agentSpreadMs).toBe(2);
    const widths = layout.spans.map((s) => s.width);
    expect(widths.reduce((a, b) => a + b, 0)).toBeCloseTo(100);
    expect(widths[2]).toBeGreaterThan(widths[0] ?? 0);
    for (const [i, s] of layout.spans.entries()) {
      const prev = layout.spans[i - 1];
      expect(s.left).toBeCloseTo(prev ? prev.left + prev.width : 0);
    }
  });
});

describe("formatElapsed", () => {
  it("picks a unit by size", () => {
    expect(formatElapsed(33)).toBe("33 ms");
    expect(formatElapsed(10_712)).toBe("10.7 sec");
    expect(formatElapsed(125_000)).toBe("2 min 5 sec");
  });
});
