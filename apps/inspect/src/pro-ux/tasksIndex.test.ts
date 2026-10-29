import { describe, expect, it } from "vitest";

import type { LogListRow } from "../app/log-list/grid/columns/types";
import { compareByOrderBy } from "../app/log-list/listing/evaluator";
import { testSampleSummary } from "../client/api/testClientApi";
import { deriveSampleFields } from "../client/utils/derive";
import type { SamplesListingRow } from "../log_data";

import {
  buildIndex,
  groupByScale,
  missingLastCompare,
  moveAfter,
  scaleGroup,
  scaleGroupLabel,
  shownSampleCount,
  shownScale,
  shownScore,
  tasksListingAccessors,
} from "./tasksIndex";

const sample = (logFile: string, score: unknown): SamplesListingRow => {
  const summary = testSampleSummary();
  return {
    logFile,
    summary,
    derived: { ...deriveSampleFields(summary), scores: { judge: score } },
    log: {},
  };
};

const row = (id: string, extra: Partial<LogListRow> = {}): LogListRow => ({
  id,
  name: id,
  type: "file",
  log: { name: id },
  ...extra,
});

const index = buildIndex([
  sample("a", 20),
  sample("a", 40),
  sample("b", 90),
  sample("c", "not a number"),
]);

describe("shown values", () => {
  it("prefers the headline metric, else the mean of sample scores", () => {
    expect(shownScore(row("a", { score: 75 }), index)).toBe(75);
    expect(shownScore(row("a"), index)).toBe(30);
    expect(shownScore(row("c"), index)).toBeUndefined();
    expect(shownScore(row("none"), index)).toBeUndefined();
  });

  it("counts samples when the log's results don't", () => {
    expect(shownSampleCount(row("a", { totalSamples: 5 }), index)).toBe(5);
    expect(shownSampleCount(row("a"), index)).toBe(2);
    expect(shownSampleCount(row("c"), index)).toBe(1);
    expect(shownSampleCount(row("none"), index)).toBeUndefined();
  });
});

describe("missingLastCompare", () => {
  it("orders numbers ascending", () => {
    expect(missingLastCompare(1, 2, false)).toBeLessThan(0);
    expect(missingLastCompare(2, 1, false)).toBeGreaterThan(0);
    expect(missingLastCompare(undefined, null, false)).toBe(0);
  });
});

describe("sorting the Tasks table by Score", () => {
  const base = {
    getValue: (r: LogListRow, id: string) => r[id],
    getComparator: () => undefined,
  };
  const rows = [
    row("none"),
    row("b"),
    row("headline", { score: 50 }),
    row("a"),
    row("c"),
  ];
  const { getValue, getComparator } = tasksListingAccessors(base, index);
  const sorted = (direction: "ASC" | "DESC") =>
    [...rows]
      .sort(
        compareByOrderBy(
          [{ column: "score", direction }],
          getValue,
          getComparator
        )
      )
      .map((r) => r.id);

  it("sorts by the shown value, rows without one last", () => {
    expect(sorted("ASC")).toEqual(["a", "headline", "b", "none", "c"]);
  });

  it("keeps rows without a score last when descending", () => {
    expect(sorted("DESC")).toEqual(["b", "headline", "a", "none", "c"]);
  });

  it("leaves other columns to the base accessors", () => {
    expect(getValue(row("x", { task: "t" }), "task")).toBe("t");
    expect(getComparator("task")).toBeUndefined();
  });
});

describe("scale groups", () => {
  const scaled = buildIndex([
    sample("tens", 6.5),
    sample("tens", 9),
    sample("hundreds", 14.3),
    sample("hundreds", 70),
    sample("unit", 0.4),
    sample("negative", -3),
  ]);
  const groupOf = (r: LogListRow) => scaleGroup(r, scaled);

  it("guesses each log's scale from its largest sample score", () => {
    expect(shownScale(row("tens"), scaled)).toBe(10);
    expect(shownScale(row("hundreds"), scaled)).toBe(100);
    expect(shownScale(row("unit"), scaled)).toBe(1);
    expect(shownScale(row("negative"), scaled)).toBeNull();
    expect(shownScale(row("headline", { score: 0.8 }), scaled)).toBe(1);
  });

  it("puts rows with no score, or no fitting scale, in their own groups", () => {
    expect(groupOf(row("negative"))).toBe("other");
    expect(groupOf(row("none"))).toBe("none");
  });

  it("never interleaves scales, and keeps each group's order", () => {
    const sortedByRawValue = [
      "negative",
      "unit",
      "tens",
      "hundreds",
      "none",
    ].map((id) => row(id));
    const groups = groupByScale(sortedByRawValue, groupOf);
    expect(groups.map((g) => [g.group, g.rows.map((r) => r.id)])).toEqual([
      [1, ["unit"]],
      [10, ["tens"]],
      [100, ["hundreds"]],
      ["other", ["negative"]],
      ["none", ["none"]],
    ]);
  });

  it("labels each group by its range", () => {
    expect(scaleGroupLabel(10)).toBe("scores 0–10");
    expect(scaleGroupLabel("none")).toBe("no score");
  });
});

describe("buildIndex signature", () => {
  it("follows each log's mean and sample count, not sample order", () => {
    const same = buildIndex([sample("a", 40), sample("a", 20)]);
    const other = buildIndex([sample("a", 20), sample("a", 41)]);
    expect(buildIndex([sample("a", 20), sample("a", 40)]).signature).toBe(
      same.signature
    );
    expect(other.signature).not.toBe(same.signature);
  });
});

describe("moveAfter", () => {
  const cols = ["status", "task", "score", "completedAt", "totalSamples"].map(
    (id) => ({ id })
  );
  const ids = (list: { id?: string }[]) => list.map((c) => c.id);

  it("puts Samples right after Score", () => {
    expect(ids(moveAfter(cols, "totalSamples", "score"))).toEqual([
      "status",
      "task",
      "score",
      "totalSamples",
      "completedAt",
    ]);
  });

  it("leaves the order alone when either column is missing", () => {
    expect(moveAfter(cols, "tokens", "score")).toBe(cols);
    expect(moveAfter(cols, "totalSamples", "nope")).toBe(cols);
  });
});
