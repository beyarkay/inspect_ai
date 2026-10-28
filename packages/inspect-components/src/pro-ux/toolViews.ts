import type { IconName } from "@tsmono/react/icons";
import { isRecord } from "@tsmono/util";

import { prismLanguageForPath } from "../chat/tools/tool";

import { diffCounts, DiffFile, DiffLine, lineDiff, parsePatch } from "./diff";
import { shellCommand } from "./shellCommand";

/** How pro-ux shows a tool call it understands. */
export type ToolView =
  /** `reads`: files whose contents the output prints. */
  | { kind: "shell"; command: string; reads?: string[] }
  | { kind: "patch"; files: DiffFile[]; note: string }
  | { kind: "read"; paths: string[]; range?: string }
  | { kind: "edit"; path: string; lines: DiffLine[]; note?: string }
  | { kind: "write"; path: string; text: string; note?: string }
  | { kind: "line"; icon: IconName; text: string; note?: string };

const kExtraLanguages: Record<string, string> = {
  ts: "javascript",
  tsx: "javascript",
  mts: "javascript",
  cts: "javascript",
  pyi: "python",
  zsh: "bash",
  jsonl: "json",
  ipynb: "json",
};

/** The loaded Prism language for a file, by extension. */
export const languageForPath = (path: string): string | undefined =>
  prismLanguageForPath(path) ??
  kExtraLanguages[path.split(".").pop()?.toLowerCase() ?? ""];

const str = (
  args: Record<string, unknown>,
  ...keys: string[]
): string | undefined => {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "string" && value !== "") return value;
  }
  return undefined;
};

const num = (
  args: Record<string, unknown>,
  key: string
): number | undefined => {
  const value = args[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
};

const strings = (value: unknown): string[] | undefined =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((v) => typeof v === "string")
    ? value
    : undefined;

/** "lines 10–40" from whichever range arguments the tool takes. */
export const lineRange = (
  args: Record<string, unknown>
): string | undefined => {
  const span = (from?: number, to?: number) =>
    from === undefined && to === undefined
      ? undefined
      : to === undefined || to < 0
        ? `from line ${from}`
        : `lines ${from ?? 1}–${to}`;
  const view = args.view_range;
  if (Array.isArray(view) && typeof view[0] === "number") {
    return span(view[0], typeof view[1] === "number" ? view[1] : undefined);
  }
  const offset = num(args, "offset");
  const limit = num(args, "limit");
  if (offset !== undefined || limit !== undefined) {
    const from = offset ?? 1;
    return limit === undefined
      ? `from line ${from}`
      : span(from, from + limit - 1);
  }
  return span(
    num(args, "start_line") ?? num(args, "line_start"),
    num(args, "end_line") ?? num(args, "line_end")
  );
};

/** Other scalar arguments, as "key value · key value". */
const otherArgs = (
  args: Record<string, unknown>,
  shown: string[]
): string | undefined => {
  const parts = Object.entries(args)
    .filter(([key, value]) => !shown.includes(key) && value !== null)
    .map(([key, value]) => {
      const text =
        typeof value === "string"
          ? value
          : (strings(value)?.join(", ") ?? JSON.stringify(value));
      return `${key} ${text}`;
    });
  return parts.length > 0 ? parts.join(" · ") : undefined;
};

const kReadVerbs = /^(cat|head|tail|nl|sed)$/;

/** The files a simple read command (`cat a.py`, `head -n 20 a.py`,
 *  `sed -n '1,80p' a.py`, `nl -ba a.py`, after an optional `cd dir &&`)
 *  prints, when they share a language we can highlight. */
export const catPaths = (command: string): string[] | undefined => {
  const m = /^\s*(?:cd\s+[\w./~-]+\s*&&\s*)?(\w+)\s+(.+?)\s*$/.exec(command);
  if (!m || !kReadVerbs.test(m[1]!)) return undefined;
  const verb = m[1]!;
  let rest = m[2]!;
  if (verb === "sed") {
    const sed = /^-n\s+'?\d+(?:,\d+)?p'?\s+(.+)$/.exec(rest);
    if (!sed) return undefined;
    rest = sed[1]!;
  }
  if (/[|;&<>$`(){}*?"'\\\n]/.test(rest)) return undefined;
  const words = rest.split(/\s+/);
  const files: string[] = [];
  for (let k = 0; k < words.length; k++) {
    const word = words[k]!;
    if (word.startsWith("-")) {
      if (/^-[nc]$/.test(word) && (verb === "head" || verb === "tail")) k++;
      continue;
    }
    files.push(word);
  }
  if (files.length === 0 || (verb !== "cat" && files.length > 1)) {
    return undefined;
  }
  const language = languageForPath(files[0]!);
  return language && files.every((f) => languageForPath(f) === language)
    ? files
    : undefined;
};

const kEditors = new Set([
  "text_editor",
  "str_replace_editor",
  "str_replace_based_edit_tool",
]);
const kPatchTools = new Set(["apply_patch", "applypatch", "apply_diff"]);

const editorView = (args: Record<string, unknown>): ToolView | undefined => {
  const path = str(args, "path");
  if (!path) return undefined;
  switch (str(args, "command", "action")) {
    case "view":
      return { kind: "read", paths: [path], range: lineRange(args) };
    case "str_replace": {
      const before = str(args, "old_str") ?? "";
      const lines = lineDiff(before, str(args, "new_str") ?? "");
      return { kind: "edit", path, lines, note: diffCounts(lines) };
    }
    case "insert": {
      const text = str(args, "insert_text", "new_str") ?? "";
      const at = num(args, "insert_line");
      const lines = text
        .split("\n")
        .map((t): DiffLine => ({ kind: "add", text: t }));
      return {
        kind: "edit",
        path,
        lines,
        note: at === 0 ? "insert at the top" : `insert after line ${at}`,
      };
    }
    case "create": {
      const text = str(args, "file_text") ?? "";
      return { kind: "write", path, text, note: writeNote(text) };
    }
    case "undo_edit":
      return { kind: "line", icon: "edit", text: path, note: "undo last edit" };
    default:
      return undefined;
  }
};

const writeNote = (text: string) => {
  const lines = text.replace(/\n$/, "").split("\n").length;
  return `new file · ${lines} line${lines === 1 ? "" : "s"}`;
};

/** What one file's patch does besides editing lines. */
export const fileOp = (file: DiffFile): string | undefined =>
  file.op === "add"
    ? "new file"
    : file.op === "delete"
      ? "deleted"
      : file.moveTo
        ? `moved to ${file.moveTo}`
        : undefined;

const patchNote = (files: DiffFile[]): string => {
  const lines = files.flatMap((f) => f.lines);
  const op = files.length === 1 ? fileOp(files[0]!) : undefined;
  const changed = lines.some((l) => l.kind === "add" || l.kind === "del");
  return [op, changed ? diffCounts(lines) : undefined]
    .filter((p) => p !== undefined)
    .join(" · ");
};

/** What pro-ux shows for a tool call, or undefined to keep the usual
 *  rendering. */
export const toolView = (
  tool: string,
  args: Record<string, unknown> | undefined
): ToolView | undefined => {
  if (!args) return undefined;

  const command = shellCommand(tool, args);
  if (command !== undefined) {
    const files = /\bapply_patch\b/.test(command)
      ? parsePatch(command)
      : undefined;
    if (files) return { kind: "patch", files, note: patchNote(files) };
    return { kind: "shell", command, reads: catPaths(command) };
  }

  if (kPatchTools.has(tool)) {
    const text = str(args, "input", "patch", "diff");
    const files = text !== undefined ? parsePatch(text) : undefined;
    return files ? { kind: "patch", files, note: patchNote(files) } : undefined;
  }
  if (kEditors.has(tool)) return editorView(args);

  switch (tool) {
    case "Read":
    case "read_file":
    case "view_file": {
      const path = str(
        args,
        "file_path",
        "path",
        "absolute_path",
        "target_file"
      );
      return path
        ? { kind: "read", paths: [path], range: lineRange(args) }
        : undefined;
    }
    case "read_files":
    case "read_many_files": {
      const paths = strings(args.paths);
      return paths ? { kind: "read", paths } : undefined;
    }
    case "Edit":
    case "replace": {
      const path = str(args, "file_path", "path");
      if (!path) return undefined;
      const lines = lineDiff(
        str(args, "old_string") ?? "",
        str(args, "new_string") ?? ""
      );
      const every = args.replace_all === true ? "every occurrence · " : "";
      return { kind: "edit", path, lines, note: every + diffCounts(lines) };
    }
    case "MultiEdit": {
      const path = str(args, "file_path");
      const edits = Array.isArray(args.edits) ? args.edits : undefined;
      if (!path || !edits) return undefined;
      const lines = edits.flatMap((edit: unknown, i): DiffLine[] => {
        const e = isRecord(edit) ? edit : {};
        return [
          { kind: "hunk", text: `edit ${i + 1} of ${edits.length}` },
          ...lineDiff(str(e, "old_string") ?? "", str(e, "new_string") ?? ""),
        ];
      });
      return { kind: "edit", path, lines, note: diffCounts(lines) };
    }
    case "Write":
    case "write_file":
    case "create_file": {
      const path = str(args, "file_path", "path");
      const text = str(args, "content", "file_text", "contents");
      return path && text !== undefined
        ? { kind: "write", path, text, note: writeNote(text) }
        : undefined;
    }
    case "web_search":
    case "WebSearch":
    case "google_web_search": {
      const query = str(args, "query", "q");
      return query
        ? {
            kind: "line",
            icon: "search",
            text: query,
            note: otherArgs(args, ["query", "q"]),
          }
        : undefined;
    }
    case "web_fetch":
    case "WebFetch":
    case "fetch_url":
    case "fetch":
    case "web_browser_go": {
      const urls =
        strings(args.urls) ??
        (str(args, "url") ? [str(args, "url")!] : undefined);
      return urls
        ? {
            kind: "line",
            icon: "globe",
            text: urls.join("\n"),
            note: otherArgs(args, ["url", "urls"]),
          }
        : undefined;
    }
    case "Grep":
    case "Glob":
    case "grep":
    case "glob":
    case "grep_files":
    case "search_file_content": {
      const pattern = str(args, "pattern");
      return pattern
        ? {
            kind: "line",
            icon: "search",
            text: pattern,
            note: otherArgs(args, ["pattern"]),
          }
        : undefined;
    }
    case "LS":
    case "list_dir":
    case "list_directory":
    case "list_files": {
      const path = str(args, "path", "dir_path", "directory");
      return path
        ? {
            kind: "line",
            icon: "folder",
            text: path,
            note: otherArgs(args, ["path", "dir_path", "directory"]),
          }
        : undefined;
    }
    default:
      return undefined;
  }
};

export interface Listing {
  /** Text before the numbered lines, such as "Here's the result of …". */
  before: string;
  numbers: string[];
  code: string;
  after: string;
}

const kNumbered = /^\s*(\d+)(?:\t|→)(.*)$/;

/** Splits `cat -n` style output (`   12\tcode` or `12→code`) into line
 *  numbers and code; undefined without a run of at least two such lines. */
export const numberedListing = (text: string): Listing | undefined => {
  const lines = text.split("\n");
  const first = lines.findIndex((l) => kNumbered.test(l));
  if (first < 0) return undefined;
  let last = first;
  while (last + 1 < lines.length && kNumbered.test(lines[last + 1]!)) last++;
  if (last === first) return undefined;
  const numbered = lines.slice(first, last + 1).map((l) => kNumbered.exec(l)!);
  return {
    before: lines.slice(0, first).join("\n").trim(),
    numbers: numbered.map((m) => m[1]!),
    code: numbered.map((m) => m[2]!).join("\n"),
    after: lines
      .slice(last + 1)
      .join("\n")
      .trim(),
  };
};

export interface FileSection {
  path?: string;
  text: string;
}

/** Splits `--- path ---` delimited output into one section per file. */
export const fileSections = (text: string, paths: string[]): FileSection[] => {
  const sections: FileSection[] = [];
  let current: FileSection = { text: "" };
  for (const line of text.split("\n")) {
    const header = /^--- (.+) ---$/.exec(line);
    if (header && paths.includes(header[1]!)) {
      if (current.path !== undefined || current.text.trim() !== "")
        sections.push(current);
      current = { path: header[1], text: "" };
    } else {
      current.text += current.text === "" ? line : `\n${line}`;
    }
  }
  sections.push(current);
  return sections.map((s) => ({ ...s, text: s.text.replace(/\s+$/, "") }));
};
