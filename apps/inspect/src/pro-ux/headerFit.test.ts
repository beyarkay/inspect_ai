import { describe, expect, it } from "vitest";

import {
  fitHeaders,
  headerMinWidth,
  kHeaderChrome,
  kHeaderWedge,
} from "./headerFit";

describe("headerMinWidth", () => {
  it("adds the cell chrome, and the wedge for ranked columns", () => {
    expect(headerMinWidth("Epoch", 37)).toBe(37 + kHeaderChrome);
    expect(headerMinWidth("Tokens", 66)).toBe(
      66 + kHeaderChrome + kHeaderWedge
    );
  });

  it("is zero when nothing could be measured", () => {
    expect(headerMinWidth("Epoch", 0)).toBe(0);
  });
});

describe("fitHeaders", () => {
  const measure = (label: string) => label.length * 8;
  const idOf = (c: { id?: string }) => c.id;

  it("widens a column too narrow for its label", () => {
    const [epoch] = fitHeaders(
      [{ id: "epoch", header: "Epoch", size: 60, minSize: 40 }],
      new Set(),
      idOf,
      measure
    );
    expect(epoch).toMatchObject({ size: 78, minSize: 78 });
  });

  it("leaves wide, skipped and non-text columns alone", () => {
    const columns = [
      { id: "input", header: "Input", size: 360, minSize: 240 },
      { id: "empty", header: "Target", size: 28, minSize: 28 },
      { id: "icon", header: () => null, size: 20 },
    ];
    expect(fitHeaders(columns, new Set(["empty"]), idOf, measure)).toEqual(
      columns
    );
  });
});
