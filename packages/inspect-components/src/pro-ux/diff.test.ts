import { describe, expect, it } from "vitest";

import { diffCounts, lineDiff, looksLikePatch, parsePatch } from "./diff";

const kinds = (lines: { kind: string; text: string }[]) =>
  lines.map((l) => `${l.kind}:${l.text}`);

describe("parsePatch, Begin Patch format", () => {
  it("reads an update with a hunk", () => {
    const files = parsePatch(
      [
        "*** Begin Patch",
        "*** Update File: app.py",
        "@@ def health():",
        " def health():",
        '-    return {"status": "ok"}',
        '+    return {"status": "ok", "component": "api"}',
        "*** End Patch",
      ].join("\n")
    );
    expect(files).toHaveLength(1);
    expect(files?.[0]?.path).toBe("app.py");
    expect(files?.[0]?.op).toBe("update");
    expect(kinds(files![0]!.lines)).toEqual([
      "hunk:@@ def health():",
      "ctx:def health():",
      'del:    return {"status": "ok"}',
      'add:    return {"status": "ok", "component": "api"}',
    ]);
  });

  it("reads added, deleted and moved files", () => {
    const files = parsePatch(
      [
        "*** Begin Patch",
        "*** Add File: notes/new.md",
        "+# Title",
        "+",
        "+body",
        "*** Delete File: old.txt",
        "*** Update File: src/a.ts",
        "*** Move to: src/b.ts",
        "@@",
        "-const a = 1;",
        "+const b = 1;",
        "*** End of File",
        "*** End Patch",
        "",
      ].join("\n")
    );
    expect(files?.map((f) => [f.path, f.op, f.moveTo])).toEqual([
      ["notes/new.md", "add", undefined],
      ["old.txt", "delete", undefined],
      ["src/a.ts", "update", "src/b.ts"],
    ]);
    expect(kinds(files![0]!.lines)).toEqual([
      "add:# Title",
      "add:",
      "add:body",
    ]);
    expect(files![1]!.lines).toEqual([]);
  });

  it("treats unsigned blank lines as context", () => {
    const files = parsePatch(
      "*** Begin Patch\n*** Update File: a.py\n@@\n x = 1\n\n-y = 2\n+y = 3\n*** End Patch"
    );
    expect(kinds(files![0]!.lines)).toEqual([
      "hunk:@@",
      "ctx:x = 1",
      "ctx:",
      "del:y = 2",
      "add:y = 3",
    ]);
  });

  it("finds the patch inside a shell command", () => {
    const files = parsePatch(
      "apply_patch <<'EOF'\n*** Begin Patch\n*** Add File: x.txt\n+hi\n*** End Patch\nEOF\n"
    );
    expect(files?.[0]?.path).toBe("x.txt");
    expect(kinds(files![0]!.lines)).toEqual(["add:hi"]);
  });
});

describe("parsePatch, unified diff", () => {
  it("reads a git diff with counted hunks", () => {
    const files = parsePatch(
      [
        "diff --git a/src/app.py b/src/app.py",
        "index 83db48f..bf269f4 100644",
        "--- a/src/app.py",
        "+++ b/src/app.py",
        "@@ -1,3 +1,3 @@",
        " import os",
        "--- not a header",
        "+++ not a header either",
        " print(os.name)",
        "diff --git a/new.txt b/new.txt",
        "new file mode 100644",
        "--- /dev/null",
        "+++ b/new.txt",
        "@@ -0,0 +1 @@",
        "+hello",
        "\\ No newline at end of file",
      ].join("\n")
    );
    expect(files?.map((f) => [f.path, f.op])).toEqual([
      ["src/app.py", "update"],
      ["new.txt", "add"],
    ]);
    expect(kinds(files![0]!.lines)).toEqual([
      "hunk:@@ -1,3 +1,3 @@",
      "ctx:import os",
      "del:-- not a header",
      "add:++ not a header either",
      "ctx:print(os.name)",
    ]);
    expect(kinds(files![1]!.lines)).toEqual([
      "hunk:@@ -0,0 +1 @@",
      "add:hello",
      "note:No newline at end of file",
    ]);
  });

  it("reads a plain diff without counts", () => {
    const files = parsePatch(
      "--- a/x.js\n+++ b/x.js\n@@\n-let a;\n+const a = 1;\n"
    );
    expect(files?.[0]?.path).toBe("x.js");
    expect(kinds(files![0]!.lines)).toEqual([
      "hunk:@@",
      "del:let a;",
      "add:const a = 1;",
    ]);
  });

  it("marks deleted files", () => {
    const files = parsePatch(
      "--- a/gone.txt\n+++ /dev/null\n@@ -1 +0,0 @@\n-bye\n"
    );
    expect(files?.[0]).toMatchObject({ path: "gone.txt", op: "delete" });
  });
});

describe("looksLikePatch", () => {
  it("rejects ordinary text", () => {
    expect(looksLikePatch("hello\n--- not a diff")).toBe(false);
    expect(parsePatch("just some text")).toBeUndefined();
  });
});

describe("lineDiff", () => {
  it("keeps shared lines as context", () => {
    expect(
      kinds(
        lineDiff(
          '    "Interpretability-Sandbox",\n    "Agents-Sandbox",',
          '    "Interpretability-Sandbox",\n    "Applied-Interpretability-Sandbox",\n    "Agents-Sandbox",'
        )
      )
    ).toEqual([
      'ctx:    "Interpretability-Sandbox",',
      'add:    "Applied-Interpretability-Sandbox",',
      'ctx:    "Agents-Sandbox",',
    ]);
  });

  it("puts removals before additions in a changed run", () => {
    expect(kinds(lineDiff("a\nb\nc\nd", "a\nB\nC\nd"))).toEqual([
      "ctx:a",
      "del:b",
      "del:c",
      "add:B",
      "add:C",
      "ctx:d",
    ]);
  });

  it("aligns interleaved changes", () => {
    expect(kinds(lineDiff("x\na\ny\nb\nz", "a\nq\nb"))).toEqual([
      "del:x",
      "ctx:a",
      "del:y",
      "add:q",
      "ctx:b",
      "del:z",
    ]);
  });

  it("ignores a final newline both sides share", () => {
    expect(kinds(lineDiff("a\n", "b\n"))).toEqual(["del:a", "add:b"]);
  });

  it("counts added and removed lines", () => {
    expect(diffCounts(lineDiff("a\nb", "a\nc\nd"))).toBe("+2 −1");
  });
});
