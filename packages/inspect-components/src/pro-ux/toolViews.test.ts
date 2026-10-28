import { describe, expect, it } from "vitest";

import {
  catPaths,
  fileSections,
  languageForPath,
  lineRange,
  numberedListing,
  toolView,
} from "./toolViews";

describe("toolView", () => {
  it("shows apply_patch as a patch, whichever argument holds it", () => {
    const patch =
      "*** Begin Patch\n*** Update File: app.py\n@@\n-a = 1\n+a = 2\n*** End Patch";
    for (const args of [{ patch }, { input: patch }]) {
      const view = toolView("apply_patch", args);
      expect(view?.kind).toBe("patch");
      expect(view?.kind === "patch" && view.note).toBe("+1 −1");
    }
    expect(toolView("apply_patch", { patch: "not a patch" })).toBeUndefined();
  });

  it("finds apply_patch run through a shell", () => {
    const view = toolView("shell", {
      command: [
        "apply_patch",
        "*** Begin Patch\n*** Add File: x.md\n+hi\n*** End Patch",
      ],
    });
    expect(view).toMatchObject({ kind: "patch", note: "new file · +1" });
  });

  it("reads text_editor commands by name", () => {
    expect(
      toolView("text_editor", {
        command: "view",
        path: "/repo/a.py",
        view_range: [10, 40],
      })
    ).toEqual({ kind: "read", paths: ["/repo/a.py"], range: "lines 10–40" });
    expect(
      toolView("str_replace_based_edit_tool", {
        command: "str_replace",
        path: "a.py",
        old_str: "x = 1",
        new_str: "x = 2",
      })
    ).toMatchObject({ kind: "edit", path: "a.py", note: "+1 −1" });
    expect(
      toolView("text_editor", {
        action: "str_replace",
        path: "a.py",
        old_str: "a",
        new_str: "a\nb",
      })
    ).toMatchObject({ kind: "edit", note: "+1" });
    expect(
      toolView("text_editor", {
        command: "create",
        path: "a.py",
        file_text: "a\nb\n",
      })
    ).toMatchObject({ kind: "write", note: "new file · 2 lines" });
    expect(
      toolView("text_editor", {
        command: "insert",
        path: "a.py",
        insert_line: 11,
        insert_text: ")\n\napp.synth()",
      })
    ).toMatchObject({
      kind: "edit",
      note: "insert after line 11",
      lines: [
        { kind: "add", text: ")" },
        { kind: "add", text: "" },
        { kind: "add", text: "app.synth()" },
      ],
    });
    expect(
      toolView("text_editor", { command: "undo_edit", path: "a.py" })
    ).toMatchObject({ kind: "line", text: "a.py", note: "undo last edit" });
    expect(toolView("text_editor", { command: "view" })).toBeUndefined();
  });

  it("reads Claude Code's file tools", () => {
    expect(
      toolView("Read", { file_path: "/a/b.ts", offset: 20, limit: 10 })
    ).toEqual({ kind: "read", paths: ["/a/b.ts"], range: "lines 20–29" });
    expect(
      toolView("Edit", {
        file_path: "b.ts",
        old_string: "a",
        new_string: "b",
        replace_all: true,
      })
    ).toMatchObject({ kind: "edit", note: "every occurrence · +1 −1" });
    expect(
      toolView("Write", { file_path: "c.ts", content: "x" })
    ).toMatchObject({ kind: "write", path: "c.ts", text: "x" });
    expect(
      toolView("MultiEdit", {
        file_path: "d.ts",
        edits: [
          { old_string: "a", new_string: "b" },
          { old_string: "c", new_string: "d" },
        ],
      })
    ).toMatchObject({ kind: "edit", note: "+2 −2" });
  });

  it("lists every path read_files reads", () => {
    expect(toolView("read_files", { paths: ["a.py", "b.md"] })).toEqual({
      kind: "read",
      paths: ["a.py", "b.md"],
    });
  });

  it("gives search and fetch tools a one-line header", () => {
    expect(toolView("web_search", { query: "inspect ai" })).toEqual({
      kind: "line",
      icon: "search",
      text: "inspect ai",
      note: undefined,
    });
    expect(
      toolView("fetch_url", {
        url: "https://php.net/x",
        section: "8.3 recent releases",
      })
    ).toMatchObject({
      icon: "globe",
      text: "https://php.net/x",
      note: "section 8.3 recent releases",
    });
    expect(
      toolView("fetch_url", { urls: ["https://a.test", "https://b.test"] })
    ).toMatchObject({ text: "https://a.test\nhttps://b.test" });
    expect(
      toolView("Grep", { pattern: "TODO", path: "src", glob: "*.ts" })
    ).toMatchObject({
      icon: "search",
      text: "TODO",
      note: "path src · glob *.ts",
    });
    expect(toolView("LS", { path: "/repo" })).toMatchObject({
      icon: "folder",
      text: "/repo",
    });
  });

  it("keeps shell commands, noting files a simple read prints", () => {
    expect(
      toolView("bash_session", { action: "type_submit", input: "cat app.py" })
    ).toEqual({ kind: "shell", command: "cat app.py", reads: ["app.py"] });
    expect(toolView("bash", { cmd: "ls -la" })).toEqual({
      kind: "shell",
      command: "ls -la",
      reads: undefined,
    });
  });

  it("leaves unknown tools and missing arguments alone", () => {
    expect(toolView("cdk_ls", {})).toBeUndefined();
    expect(
      toolView("experiment_store.download", { run_id: "x" })
    ).toBeUndefined();
    expect(toolView("Read", undefined)).toBeUndefined();
    expect(toolView("web_search", { query: 3 })).toBeUndefined();
  });
});

describe("catPaths", () => {
  it("accepts simple reads of files we can highlight", () => {
    expect(catPaths("cat app.py")).toEqual(["app.py"]);
    expect(catPaths("cd /repo && cat pyproject.yaml")).toEqual([
      "pyproject.yaml",
    ]);
    expect(catPaths("head -n 40 src/main.ts")).toEqual(["src/main.ts"]);
    expect(catPaths("sed -n '1,160p' server/main.py")).toEqual([
      "server/main.py",
    ]);
    expect(catPaths("nl -ba app.py")).toEqual(["app.py"]);
    expect(catPaths("cat a.json b.json")).toEqual(["a.json", "b.json"]);
  });

  it("rejects pipes, chains, globs and mixed or unknown languages", () => {
    expect(catPaths("cat app.py | head")).toBeUndefined();
    expect(catPaths("cat app.py && ls")).toBeUndefined();
    expect(catPaths("cat *.py")).toBeUndefined();
    expect(catPaths("cat a.py b.json")).toBeUndefined();
    expect(catPaths("cat README.md")).toBeUndefined();
    expect(catPaths("head a.py b.py")).toBeUndefined();
    expect(catPaths("ls app.py")).toBeUndefined();
  });
});

describe("lineRange", () => {
  it("formats each tool's range arguments", () => {
    expect(lineRange({ view_range: [5, -1] })).toBe("from line 5");
    expect(lineRange({ offset: 100 })).toBe("from line 100");
    expect(lineRange({ limit: 50 })).toBe("lines 1–50");
    expect(lineRange({ start_line: 3, end_line: 9 })).toBe("lines 3–9");
    expect(lineRange({})).toBeUndefined();
  });
});

describe("languageForPath", () => {
  it("maps extensions to loaded Prism languages", () => {
    expect(languageForPath("a/b.py")).toBe("python");
    expect(languageForPath("x.tsx")).toBe("javascript");
    expect(languageForPath("Dockerfile")).toBeUndefined();
  });
});

describe("numberedListing", () => {
  it("splits cat -n output into a gutter and code", () => {
    expect(
      numberedListing(
        "Here's the result of running `cat -n` on /a.py:\n     1\timport os\n     2\t\n     3\tprint(os.name)\n"
      )
    ).toEqual({
      before: "Here's the result of running `cat -n` on /a.py:",
      numbers: ["1", "2", "3"],
      code: "import os\n\nprint(os.name)",
      after: "",
    });
  });

  it("reads Claude Code's arrow numbering", () => {
    expect(numberedListing("  9→a\n 10→b")?.numbers).toEqual(["9", "10"]);
  });

  it("needs at least two numbered lines", () => {
    expect(numberedListing("1\tonly one")).toBeUndefined();
    expect(numberedListing("plain text")).toBeUndefined();
  });
});

describe("fileSections", () => {
  it("splits at the requested paths only", () => {
    expect(
      fileSections(
        "--- a.py ---\nx = 1\n--- not/asked ---\n\n--- b.md ---\n# B\n",
        ["a.py", "b.md"]
      )
    ).toEqual([
      { path: "a.py", text: "x = 1\n--- not/asked ---" },
      { path: "b.md", text: "# B" },
    ]);
  });

  it("returns the whole text when no header matches", () => {
    expect(fileSections("x = 1", ["a.py"])).toEqual([{ text: "x = 1" }]);
  });
});
