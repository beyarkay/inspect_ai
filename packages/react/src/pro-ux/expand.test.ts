import { describe, expect, it } from "vitest";

import { hiddenLineCount, kMinHiddenLines, worthCollapsing } from "./expand";

describe("worthCollapsing", () => {
  it("shows content that is only a few lines too tall", () => {
    expect(worthCollapsing(4, 21)).toBe(false);
    expect(worthCollapsing(kMinHiddenLines * 21, 21)).toBe(false);
  });

  it("collapses content with more than the minimum hidden", () => {
    expect(worthCollapsing(kMinHiddenLines * 21 + 1, 21)).toBe(true);
    expect(worthCollapsing(5430, 24)).toBe(true);
  });

  it("never collapses content that fits", () => {
    expect(worthCollapsing(0, 21)).toBe(false);
    expect(worthCollapsing(-30, 21)).toBe(false);
  });
});

describe("hiddenLineCount", () => {
  it("rounds hidden pixels to whole lines", () => {
    expect(hiddenLineCount(330, 21)).toBe(16);
    expect(hiddenLineCount(5430, 24)).toBe(226);
  });

  it("is at least one", () => {
    expect(hiddenLineCount(3, 21)).toBe(1);
  });
});
