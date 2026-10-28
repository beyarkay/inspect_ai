import { describe, expect, it } from "vitest";

import { caretAction } from "./cardExpand";

describe("caretAction", () => {
  it("steps folded, cut short, every line, folded", () => {
    expect(caretAction(true, "none", false)).toBe("open");
    expect(caretAction(false, "truncated", false)).toBe("showAll");
    expect(caretAction(false, "full", false)).toBe("fold");
  });

  it("folds a card with nothing cut short in one click", () => {
    expect(caretAction(false, "none", false)).toBe("fold");
  });

  it("only folds and unfolds with a modifier", () => {
    expect(caretAction(false, "truncated", true)).toBe("fold");
    expect(caretAction(false, "full", true)).toBe("fold");
    expect(caretAction(true, "full", true)).toBe("unfold");
  });
});
