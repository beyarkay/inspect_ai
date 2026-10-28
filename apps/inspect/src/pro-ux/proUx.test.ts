import { describe, expect, it } from "vitest";

import { scaleTop } from "./cells";
import { css, inferno, isDark, prgn, sequential } from "./colour";
import { parseDuration, parseNumber } from "./grid";

describe("parseDuration", () => {
  it.each([
    ["3.5 sec", 3.5],
    ["1 min 9 sec", 69],
    ["2 hr 4 min", 7440],
    ["250 ms", 0.25],
    ["2 days", 172800],
  ])("%s → %d seconds", (text, seconds) => {
    expect(parseDuration(text)).toBeCloseTo(seconds);
  });

  it("returns null for text with no duration", () => {
    expect(parseDuration("-")).toBeNull();
  });
});

describe("parseNumber", () => {
  it("reads thousands separators", () => {
    expect(parseNumber("1,313,096")).toBe(1313096);
  });

  it("rejects mixed text", () => {
    expect(parseNumber("3 sec")).toBeNull();
    expect(parseNumber("C")).toBeNull();
  });
});

describe("scaleTop", () => {
  it.each([
    [[0, 0.4, 1], 1],
    [[3, 6], 10],
    [[12, 87], 100],
    [[250], null],
    [[-1, 3], null],
    [[], null],
  ])("%j → %s", (values, top) => {
    expect(scaleTop(values)).toBe(top);
  });
});

describe("colour", () => {
  it("hits the ColorBrewer and matplotlib end stops", () => {
    expect(css(prgn(0))).toBe("rgb(64, 0, 75)");
    expect(css(prgn(1))).toBe("rgb(0, 68, 27)");
    expect(css(inferno(0))).toBe("rgb(0, 0, 4)");
  });

  it("puts the PRGn midpoint at the neutral grey", () => {
    expect(css(prgn(0.5))).toBe("rgb(247, 247, 247)");
  });

  it("makes more mean darker on the clipped sequential map", () => {
    expect(isDark(sequential(1))).toBe(true);
    expect(isDark(sequential(0))).toBe(false);
  });
});
