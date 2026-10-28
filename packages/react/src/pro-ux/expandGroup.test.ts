import { describe, expect, it, vi } from "vitest";

import { ExpandGroup, groupLevel, memberState } from "./expandGroup";

describe("memberState", () => {
  it("is short when nothing is worth hiding, whatever the stored state", () => {
    expect(memberState(false, true)).toBe("short");
    expect(memberState(false, false)).toBe("short");
  });

  it("is truncated or full by the panel's state", () => {
    expect(memberState(true, true)).toBe("truncated");
    expect(memberState(true, false)).toBe("full");
  });
});

describe("groupLevel", () => {
  it("is none without a panel worth cutting short", () => {
    expect(groupLevel([])).toBe("none");
    expect(groupLevel(["short", "short"])).toBe("none");
  });

  it("is truncated while any panel is cut short", () => {
    expect(groupLevel(["full", "truncated", "short"])).toBe("truncated");
  });

  it("is full when every long panel shows every line", () => {
    expect(groupLevel(["short", "full", "full"])).toBe("full");
  });
});

const member = (state: "short" | "truncated" | "full") => {
  const actions = { show: vi.fn(), reset: vi.fn() };
  return { state, actions: { current: actions }, calls: actions };
};

describe("ExpandGroup", () => {
  it("notifies only when the level changes", () => {
    const group = new ExpandGroup();
    const listener = vi.fn();
    group.subscribe(listener);
    const a = {};
    const b = {};
    group.set(a, member("truncated"));
    group.set(b, member("short"));
    expect(group.getLevel()).toBe("truncated");
    expect(listener).toHaveBeenCalledTimes(1);
    group.set(a, member("full"));
    expect(group.getLevel()).toBe("full");
    group.set(a, undefined);
    expect(group.getLevel()).toBe("none");
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("shows only cut-short panels and resets every panel", () => {
    const group = new ExpandGroup();
    const cut = member("truncated");
    const short = member("short");
    group.set({}, cut);
    group.set({}, short);
    group.showAll();
    expect(cut.calls.show).toHaveBeenCalledTimes(1);
    expect(short.calls.show).not.toHaveBeenCalled();
    group.resetAll();
    expect(cut.calls.reset).toHaveBeenCalledTimes(1);
    expect(short.calls.reset).toHaveBeenCalledTimes(1);
  });
});
