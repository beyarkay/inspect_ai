import { describe, expect, it } from "vitest";

/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- partial log fixtures */

import type { EvalSample } from "@tsmono/inspect-common/types";

import {
  formatAxisTotal,
  secondSpans,
  sharedInput,
  tokenSpans,
} from "./trajectory";

const messages = [
  { role: "system", content: "x".repeat(40) },
  { role: "user", content: "y".repeat(8) },
  {
    role: "assistant",
    content: [
      { type: "reasoning", reasoning: "r".repeat(12), redacted: false },
      { type: "text", text: "a".repeat(4) },
    ],
    tool_calls: [{ id: "1", function: "bash", arguments: { cmd: "ls" } }],
  },
  { role: "tool", function: "bash", content: "z".repeat(20) },
  {
    role: "tool",
    function: "bash",
    content: "",
    error: { type: "unknown", message: "boom" },
  },
] as unknown as EvalSample["messages"];

describe("tokenSpans", () => {
  it("lays messages end to end, characters ÷ 4 wide", () => {
    const { spans, total } = tokenSpans(messages);
    expect(spans.map((s) => [s.kind, s.start, s.end])).toEqual([
      ["system", 0, 10],
      ["user", 10, 12],
      ["reasoning", 12, 15],
      ["assistant", 15, 16],
      ["tool", 16, 19],
      ["tool", 19, 24],
      ["error", 24, 25],
    ]);
    expect(total).toBe(25);
    expect(spans[4]?.label).toContain("tool call: bash");
  });

  it("uses the summary of redacted reasoning", () => {
    const { spans } = tokenSpans([
      {
        role: "assistant",
        content: [
          { type: "reasoning", reasoning: "", redacted: true, summary: "ss" },
        ],
      },
    ] as unknown as EvalSample["messages"]);
    expect(spans).toHaveLength(1);
    expect(spans[0]?.kind).toBe("reasoning");
  });
});

const at = (s: number) =>
  new Date(Date.UTC(2026, 9, 28, 14, 0, s)).toISOString();

describe("secondSpans", () => {
  it("places model, tool and scoring time from the origin", () => {
    const events = [
      { event: "span_begin", id: "a", type: "solvers", timestamp: at(0) },
      {
        event: "model",
        model: "m",
        timestamp: at(1),
        completed: at(5),
        output: { usage: { output_tokens: 100, reasoning_tokens: 25 } },
      },
      { event: "tool", function: "bash", timestamp: at(5), completed: at(7) },
      { event: "span_begin", id: "s", type: "scorers", timestamp: at(8) },
      { event: "model", model: "judge", timestamp: at(8), completed: at(9) },
      { event: "span_end", id: "s", timestamp: at(10) },
    ] as unknown as EvalSample["events"];
    const { spans, total } = secondSpans(events);
    expect(spans.map((s) => [s.kind, s.start, s.end])).toEqual([
      ["reasoning", 1, 2],
      ["assistant", 2, 5],
      ["tool", 5, 7],
      ["score", 8, 10],
    ]);
    expect(total).toBe(10);
  });

  it("closes an unterminated scoring span at the last event", () => {
    const events = [
      { event: "span_begin", id: "s", type: "scorers", timestamp: at(0) },
      { event: "score", timestamp: at(3) },
    ] as unknown as EvalSample["events"];
    expect(secondSpans(events).spans).toEqual([
      expect.objectContaining({ kind: "score", start: 0, end: 3 }),
    ]);
  });
});

describe("sharedInput", () => {
  it("returns the input only when every row has it", () => {
    expect(sharedInput(["a", "a", "a"])).toBe("a");
    expect(sharedInput(["a", "b"])).toBeUndefined();
    expect(sharedInput(["a"])).toBeUndefined();
    expect(sharedInput(["", ""])).toBeUndefined();
  });
});

describe("formatAxisTotal", () => {
  it("abbreviates tokens and rounds seconds", () => {
    expect(formatAxisTotal("tokens", 950)).toBe("≈950");
    expect(formatAxisTotal("tokens", 1712)).toBe("≈1.7k");
    expect(formatAxisTotal("tokens", 23_400)).toBe("≈23k");
    expect(formatAxisTotal("seconds", 7.24)).toBe("7.2 s");
    expect(formatAxisTotal("seconds", 63.6)).toBe("64 s");
  });
});
