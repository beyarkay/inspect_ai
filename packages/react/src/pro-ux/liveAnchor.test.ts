// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useLiveAnchor } from "./liveAnchor";

const name = (row: { name: string }) => row.name;

describe("useLiveAnchor", () => {
  it("keys rows by identity, so a row inserted above shifts no keys", () => {
    const before = renderHook(() =>
      useLiveAnchor([{ name: "a" }, { name: "c" }], name, true)
    ).result.current;
    const after = renderHook(() =>
      useLiveAnchor([{ name: "a" }, { name: "b" }, { name: "c" }], name, true)
    ).result.current;
    expect(before.getItemKey?.(1)).toBe("c");
    expect(after.getItemKey?.(2)).toBe("c");
  });

  it("anchors the row in view only while live", () => {
    expect(
      renderHook(() => useLiveAnchor([], name, true)).result.current
    ).toMatchObject({ anchorTo: "end" });
    expect(
      renderHook(() => useLiveAnchor([], name, false)).result.current
    ).toMatchObject({ anchorTo: "start" });
  });

  it("keeps anchoring for a few seconds after the list stops being live", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ live }) => useLiveAnchor([], name, live),
      { initialProps: { live: true } }
    );
    rerender({ live: false });
    expect(result.current.anchorTo).toBe("end");
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.anchorTo).toBe("start");
    vi.useRealTimers();
  });

  it("leaves lists without an identity keyed by position", () => {
    expect(
      renderHook(() => useLiveAnchor([{ name: "a" }], undefined, true)).result
        .current
    ).toEqual({ getItemKey: undefined, anchorTo: "start" });
  });
});
