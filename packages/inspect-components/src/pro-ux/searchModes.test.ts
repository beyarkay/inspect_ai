import { describe, expect, it } from "vitest";

import { defaultSearchType, searchModeSegments } from "./searchModes";

describe("defaultSearchType", () => {
  it("opens on grep under pro-UX and on LLM upstream", () => {
    expect(defaultSearchType(true)).toBe("grep");
    expect(defaultSearchType(false)).toBe("llm");
  });
});

describe("searchModeSegments", () => {
  it("puts the default first", () => {
    for (const proUx of [true, false]) {
      expect(searchModeSegments(proUx)[0]?.id).toBe(defaultSearchType(proUx));
    }
  });

  it("labels grep in lowercase only under pro-UX", () => {
    const label = (proUx: boolean) =>
      searchModeSegments(proUx).find((s) => s.id === "grep")?.label;
    expect(label(true)).toBe("grep");
    expect(label(false)).toBe("Grep");
  });
});
