import { describe, expect, it } from "vitest";

import {
  argsDetail,
  argsSummary,
  firstNumericScore,
  formatOnScale,
  maxBinShare,
  numericScore,
  scoreStats,
} from "./taskStats";

describe("numericScore", () => {
  it.each([
    [42, 42],
    [true, 1],
    [false, 0],
    ["C", 1],
    ["P", 0.5],
    ["I", 0],
    ["7.5", 7.5],
  ])("%s → %s", (value, expected) => {
    expect(numericScore(value)).toBe(expected);
  });

  it.each([[""], ["hello"], [null], [{ a: 1 }], [Number.NaN]])(
    "%s is not a number",
    (value) => {
      expect(numericScore(value)).toBeNull();
    }
  );

  it("takes the first score that reads as a number", () => {
    expect(firstNumericScore({ judge: { v: 1 }, monitor: 61 })).toBe(61);
    expect(firstNumericScore(undefined)).toBeNull();
  });
});

describe("scoreStats", () => {
  it("bins values over the inferred 0–100 scale", () => {
    const stats = scoreStats([5, 15, 15, 95, 100]);
    expect(stats?.top).toBe(100);
    expect(stats?.n).toBe(5);
    expect(stats?.mean).toBeCloseTo(46);
    expect(stats?.bins).toEqual([1, 2, 0, 0, 0, 0, 0, 0, 0, 2]);
  });

  it("puts the top of the scale in the last bin", () => {
    expect(scoreStats([0, 1, 1])?.bins).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 2]);
  });

  it("leaves bins empty when no scale fits", () => {
    const stats = scoreStats([150, 300]);
    expect(stats?.top).toBeNull();
    expect(stats?.bins.every((b) => b === 0)).toBe(true);
  });

  it("is null without values", () => {
    expect(scoreStats([])).toBeNull();
  });

  it("shares one y range: the largest bin share over every row", () => {
    expect(
      maxBinShare([scoreStats([1, 1, 0, 0]), scoreStats([5, 5, 5, 9]), null])
    ).toBeCloseTo(0.75);
  });
});

describe("formatOnScale", () => {
  it("uses the decimals the scale warrants", () => {
    expect(formatOnScale(21.2261, 100)).toBe("21.2");
    expect(formatOnScale(3.254, 10)).toBe("3.25");
    expect(formatOnScale(0.12345, 1)).toBe("0.123");
    expect(formatOnScale(87, 100)).toBe("87");
  });
});

describe("task args", () => {
  const args = {
    trajectories: "trajectories/a.json",
    monitor_model: '{"model": "mockllm", "config": {"t": 0}}',
    limit: 3,
    tags: ["a", "b"],
  };

  it("summarises each arg on one line, nested values as their keys", () => {
    expect(argsSummary(args)).toEqual([
      { key: "trajectories", value: "trajectories/a.json" },
      { key: "monitor_model", value: "{model, config}" },
      { key: "limit", value: "3" },
      { key: "tags", value: "[2]" },
    ]);
  });

  it("pretty-prints JSON held in strings", () => {
    expect(argsDetail(args.monitor_model)).toBe(
      '{\n  "model": "mockllm",\n  "config": {\n    "t": 0\n  }\n}'
    );
    expect(argsDetail("plain {not json")).toBe("plain {not json");
  });
});
