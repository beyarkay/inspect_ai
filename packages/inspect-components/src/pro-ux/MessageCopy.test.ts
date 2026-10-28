import { describe, expect, it } from "vitest";

import {
  testAssistantMessage,
  testSystemMessage,
  testToolCall,
  testToolMessage,
  testUserMessage,
} from "@tsmono/inspect-common/testing";

import { messageCopyText } from "./MessageCopy";

describe("messageCopyText", () => {
  it("copies string content verbatim, whitespace included", () => {
    const copied = messageCopyText(
      testUserMessage({ content: "  line one\nline two\n" })
    );
    expect(copied?.text).toBe("  line one\nline two\n");
    expect(copied?.hint).toBe(
      "Copy this message's text exactly as sent to the model"
    );
  });

  it("joins text blocks and names what it leaves out", () => {
    const message = testAssistantMessage({
      content: [
        { type: "reasoning", reasoning: "hmm", redacted: false },
        { type: "text", text: "first" },
        { type: "text", text: "second" },
      ],
      tool_calls: [testToolCall({ id: "1", function: "bash" })],
    });
    expect(messageCopyText(message)).toEqual({
      text: "first\n\nsecond",
      hint: "Copy this message's text exactly as the model returned it (2 text blocks, joined by a blank line); leaves out reasoning and tool calls",
    });
  });

  it("offers nothing for tool and system messages or empty text", () => {
    expect(
      messageCopyText(testToolMessage({ content: "out", tool_call_id: "1" }))
    ).toBeNull();
    expect(messageCopyText(testSystemMessage({ content: "sys" }))).toBeNull();
    expect(messageCopyText(testUserMessage({ content: "   " }))).toBeNull();
  });
});
