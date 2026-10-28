import { describe, expect, it } from "vitest";

import {
  childEntries,
  crumbPath,
  isLogPath,
  logFacts,
  tildePath,
} from "./crumbs";

const paths = [
  "a/2026-01-01_x.eval",
  "a/2026-02-01_y.eval",
  "a/deep/z.eval",
  "b/w.eval",
  "top.eval",
];

describe("childEntries", () => {
  it("lists folders A–Z then logs newest first at the root", () => {
    expect(childEntries(paths, "")).toEqual([
      { name: "a", path: "a", kind: "folder", logs: 3 },
      { name: "b", path: "b", kind: "folder", logs: 1 },
      { name: "top.eval", path: "top.eval", kind: "log", logs: 1 },
    ]);
  });

  it("lists a folder's own children, ignoring a trailing slash", () => {
    expect(childEntries(paths, "a/").map((e) => e.path)).toEqual([
      "a/deep",
      "a/2026-02-01_y.eval",
      "a/2026-01-01_x.eval",
    ]);
  });

  it("does not match a folder by prefix alone", () => {
    expect(childEntries(["ab/x.eval"], "a")).toEqual([]);
  });
});

describe("crumbPath", () => {
  const parts = ["a", "x.eval", "sample"];
  it("has no path for the log dir's parent", () => {
    expect(crumbPath(parts, 0)).toBeUndefined();
  });
  it("maps the log dir to the empty path and later crumbs to their parts", () => {
    expect(crumbPath(parts, 1)).toBe("");
    expect(crumbPath(parts, 2)).toBe("a");
    expect(crumbPath(parts, 3)).toBe("a/x.eval");
  });
});

describe("path helpers", () => {
  it("shortens home directories", () => {
    expect(tildePath("/Users/me/projects/x")).toBe("~/projects/x");
    expect(tildePath("/home/me")).toBe("~");
    expect(tildePath("/srv/logs")).toBe("/srv/logs");
  });
  it("recognises log files", () => {
    expect(isLogPath("a/x.eval")).toBe(true);
    expect(isLogPath("a/x.json")).toBe(true);
    expect(isLogPath("a/x")).toBe(false);
  });
});

describe("logFacts", () => {
  const facts = {
    task: "t",
    model: "m",
    status: "error",
    samples: 1,
    metric: { name: "accuracy", value: 0.61234 },
    started: "2026-10-28T14:02:00Z",
  };
  it("lists every fact in order", () => {
    expect(logFacts(facts)).toEqual([
      "t",
      "m",
      "error",
      "1 sample",
      "accuracy 0.612",
      "2026-10-28T14:02:00Z",
    ]);
  });
  it("leaves out what the page already shows", () => {
    expect(
      logFacts(facts, new Set(["task", "model", "samples"]), () => "date")
    ).toEqual(["error", "accuracy 0.612", "date"]);
  });
});
