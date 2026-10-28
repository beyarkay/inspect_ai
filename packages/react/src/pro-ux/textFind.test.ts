import { describe, expect, it } from "vitest";

import { findInChunks, stepIndex } from "./textFind";

describe("findInChunks", () => {
  it("finds every occurrence, ignoring case", () => {
    expect(findInChunks(["Monitor the monitor"], "monitor")).toEqual([
      { start: [0, 0], end: [0, 7], from: 0, to: 7 },
      { start: [0, 12], end: [0, 19], from: 12, to: 19 },
    ]);
  });

  it("finds a match split across chunks", () => {
    expect(findInChunks(["moni", "tor-candidate"], "monitor-c")).toEqual([
      { start: [0, 0], end: [1, 5], from: 0, to: 9 },
    ]);
  });

  it("ends a match on the chunk it closes", () => {
    expect(findInChunks(["ab", "cd"], "ab").map((m) => m.end)).toEqual([
      [0, 2],
    ]);
    expect(findInChunks(["ab", "cd"], "cd").map((m) => m.start)).toEqual([
      [1, 0],
    ]);
  });

  it("treats the term as text, not a pattern", () => {
    expect(findInChunks(["a.b axb (x)"], "a.b")).toHaveLength(1);
    expect(findInChunks(["a.b axb (x)"], "(x)")).toEqual([
      { start: [0, 8], end: [0, 11], from: 8, to: 11 },
    ]);
  });

  it("takes a regular expression as given, case and all", () => {
    const spans = (pattern: RegExp) =>
      findInChunks(["ec2:Create EC2 ec22"], pattern).map((m) => [m.from, m.to]);
    expect(spans(/ec2\b/)).toEqual([[0, 3]]);
    expect(spans(/ec2\b/i)).toEqual([
      [0, 3],
      [11, 14],
    ]);
    expect(spans(/x*/)).toEqual([]);
  });

  it("returns nothing for an empty term or no text", () => {
    expect(findInChunks(["abc"], "")).toEqual([]);
    expect(findInChunks([], "a")).toEqual([]);
  });
});

describe("stepIndex", () => {
  const positions = [10, 20, 30];
  const against = (at: number) => (i: number) =>
    Math.sign((positions[i] ?? 0) - at);

  it("steps to the next match after the reference", () => {
    expect(stepIndex(3, against(20), false)).toBe(2);
    expect(stepIndex(3, against(5), false)).toBe(0);
    expect(stepIndex(3, against(30), false)).toBe(-1);
  });

  it("steps back to the last match before the reference", () => {
    expect(stepIndex(3, against(20), true)).toBe(0);
    expect(stepIndex(3, against(35), true)).toBe(2);
    expect(stepIndex(3, against(10), true)).toBe(-1);
  });

  it("can land on a match at the reference", () => {
    expect(stepIndex(3, against(20), false, true)).toBe(1);
    expect(stepIndex(3, against(20), true, true)).toBe(1);
  });
});
