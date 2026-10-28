import { describe, expect, it } from "vitest";

import { modelTabHints, modelTabLabels, withHint } from "./hints";

describe("modelTabHints", () => {
  it("says how much of the input the summary shows", () => {
    const hints = modelTabHints({
      shown: 1,
      total: 11,
      toolCalls: ["bash_session"],
      tools: 3,
    });
    expect(hints.Summary).toBe(
      "The newest 1 of the 11 input messages (the rest appear earlier in this transcript), then the model's reply. The reply's tool call (bash_session) appears as the Tool event that follows. Token usage and settings follow the reply."
    );
    expect(hints.Messages).toContain("exact 11 messages");
    expect(hints.Tools).toContain("3 tools");
  });

  it("says when the summary shows only the reply", () => {
    const hints = modelTabHints({
      shown: 0,
      total: 5,
      toolCalls: [],
      tools: 1,
    });
    expect(hints.Summary).toBe(
      "Only the model's reply: its 5 input messages appear earlier in this transcript. Token usage and settings follow the reply."
    );
  });

  it("uses the singular for one message and omits absent tool calls", () => {
    const hints = modelTabHints({
      shown: 1,
      total: 1,
      toolCalls: [],
      tools: 1,
    });
    expect(hints.Summary).toBe(
      "All 1 input message, then the model's reply. Token usage and settings follow the reply."
    );
    expect(hints.Messages).toContain("exact 1 message ");
  });
});

describe("modelTabLabels", () => {
  it("names each tab by what it holds, with counts", () => {
    expect(modelTabLabels({ total: 7, tools: 4 })).toEqual({
      Messages: "Full input (7)",
      Tools: "Tools (4)",
      API: "Raw API",
    });
  });
});

describe("withHint", () => {
  it("appends after a blank line, or stands alone", () => {
    expect(withHint("10:02", "hint")).toBe("10:02\n\nhint");
    expect(withHint(undefined, "hint")).toBe("hint");
    expect(withHint("10:02", false)).toBe("10:02");
  });
});
