import { describe, expect, it } from "vitest";

import { autoRunKey } from "./useAutoRun";

const options = { ignoreCase: true, regex: false, wordBoundary: false };

describe("autoRunKey", () => {
  it("never auto-runs an LLM search", () => {
    expect(autoRunKey("llm", "is the model lying?", options)).toBeNull();
  });

  it("is null for a blank grep query", () => {
    expect(autoRunKey("grep", "   ", options)).toBeNull();
  });

  it("ignores surrounding whitespace", () => {
    expect(autoRunKey("grep", " eval ", options)).toBe(
      autoRunKey("grep", "eval", options)
    );
  });

  it("changes when an option changes", () => {
    expect(autoRunKey("grep", "eval", { ...options, regex: true })).not.toBe(
      autoRunKey("grep", "eval", options)
    );
  });
});
