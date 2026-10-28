import { describe, expect, it } from "vitest";

import { kLandingGap, landingDelta, type LandingGeometry } from "./landing";

const geometry = (over: Partial<LandingGeometry>): LandingGeometry => ({
  targetTop: 0,
  targetHeight: 20,
  pinTop: 170,
  headerHeight: 36,
  viewBottom: 900,
  ...over,
});

describe("landingDelta", () => {
  it("puts a header on its pin line", () => {
    expect(landingDelta(geometry({ targetTop: 156 }), "header")).toBe(-14);
    expect(landingDelta(geometry({ targetTop: 170 }), "header")).toBe(0);
  });

  it("puts a message just under the pinned header", () => {
    const at = 170 + 36 + kLandingGap;
    expect(landingDelta(geometry({ targetTop: 762 }), "top")).toBe(762 - at);
    expect(landingDelta(geometry({ targetTop: at }), "top")).toBe(0);
  });

  it("centres a match in the clear space below the header", () => {
    const clearMiddle = (170 + 36 + 900) / 2;
    expect(
      landingDelta(geometry({ targetTop: clearMiddle - 10 }), "center")
    ).toBe(0);
    expect(landingDelta(geometry({ targetTop: 100 }), "center")).toBe(
      110 - clearMiddle
    );
  });
});
