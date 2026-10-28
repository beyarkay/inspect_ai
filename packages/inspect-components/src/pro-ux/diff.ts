export type DiffKind = "add" | "del" | "ctx" | "hunk" | "note";

export interface DiffLine {
  kind: DiffKind;
  text: string;
}

export interface DiffFile {
  path: string;
  op: "update" | "add" | "delete";
  moveTo?: string;
  lines: DiffLine[];
}

const kBegin = "*** Begin Patch";

/** Whether text is an `*** Begin Patch` patch or a unified diff. */
export const looksLikePatch = (text: string): boolean =>
  text.includes(kBegin) ||
  (/^@@/m.test(text) &&
    (/^diff --git /m.test(text) || /^--- .*\n\+\+\+ /m.test(text)));

/** The files an `*** Begin Patch` patch or unified diff changes; undefined
 *  when the text is neither. */
export const parsePatch = (text: string): DiffFile[] | undefined => {
  if (!looksLikePatch(text)) return undefined;
  const start = text.indexOf(kBegin);
  const files =
    start >= 0 ? parseBeginPatch(text.slice(start)) : parseUnifiedDiff(text);
  return files.length > 0 ? files : undefined;
};

const kFileOp: Record<string, DiffFile["op"]> = {
  Update: "update",
  Add: "add",
  Delete: "delete",
};

const parseBeginPatch = (text: string): DiffFile[] => {
  const files: DiffFile[] = [];
  let file: DiffFile | undefined;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (line.startsWith("*** End Patch")) break;
    if (line.startsWith(kBegin) || line === "*** End of File") continue;
    const header = /^\*\*\* (Update|Add|Delete) File: (.+)$/.exec(line);
    if (header) {
      file = { path: header[2]!.trim(), op: kFileOp[header[1]!]!, lines: [] };
      files.push(file);
      continue;
    }
    if (!file) continue;
    const move = /^\*\*\* Move to: (.+)$/.exec(line);
    if (move) {
      file.moveTo = move[1]!.trim();
    } else if (line.startsWith("@@")) {
      file.lines.push({ kind: "hunk", text: line });
    } else {
      file.lines.push(signedLine(line));
    }
  }
  for (const f of files) {
    while (f.lines.length > 0 && isBlankContext(f.lines[f.lines.length - 1]!))
      f.lines.pop();
  }
  return files;
};

const isBlankContext = (line: DiffLine) =>
  line.kind === "ctx" && line.text === "";

/** A hunk body line; a line without a sign is context that lost its space. */
const signedLine = (line: string): DiffLine => {
  switch (line[0]) {
    case "+":
      return { kind: "add", text: line.slice(1) };
    case "-":
      return { kind: "del", text: line.slice(1) };
    case " ":
      return { kind: "ctx", text: line.slice(1) };
    case "\\":
      return { kind: "note", text: line.slice(1).trim() };
    default:
      return { kind: "ctx", text: line };
  }
};

const diffPath = (raw: string): string => {
  const path = raw.split("\t")[0]!.trim();
  return /^[ab]\//.test(path) ? path.slice(2) : path;
};

const parseUnifiedDiff = (text: string): DiffFile[] => {
  const files: DiffFile[] = [];
  const lines = text.split("\n").map((l) => l.replace(/\r$/, ""));
  let file: DiffFile | undefined;
  let oldLeft = 0;
  let newLeft = 0;
  let loose = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const next = lines[i + 1];
    const fileHeader =
      line.startsWith("diff --git ") ||
      (line.startsWith("--- ") && next?.startsWith("+++ "));

    if (file && (oldLeft > 0 || newLeft > 0)) {
      const parsed = signedLine(line);
      file.lines.push(parsed);
      if (parsed.kind !== "add" && parsed.kind !== "note") oldLeft--;
      if (parsed.kind !== "del" && parsed.kind !== "note") newLeft--;
      continue;
    }
    if (
      file &&
      (line.startsWith("\\") || (loose && !fileHeader && /^[ +-]/.test(line)))
    ) {
      file.lines.push(signedLine(line));
      continue;
    }
    loose = false;

    const git = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (git) {
      file = { path: git[2]!, op: "update", lines: [] };
      files.push(file);
      continue;
    }
    if (line.startsWith("--- ") && next?.startsWith("+++ ")) {
      const from = diffPath(line.slice(4));
      const to = diffPath(next.slice(4));
      const op =
        from === "/dev/null" ? "add" : to === "/dev/null" ? "delete" : "update";
      const path = to === "/dev/null" ? from : to;
      if (file && file.lines.length === 0) {
        file.path = path;
        if (op !== "update") file.op = op;
      } else {
        file = { path, op, lines: [] };
        files.push(file);
      }
      i++;
      continue;
    }
    if (!file) continue;
    if (line.startsWith("new file mode")) file.op = "add";
    else if (line.startsWith("deleted file mode")) file.op = "delete";
    else if (line.startsWith("rename to ")) file.moveTo = line.slice(10);
    else if (line.startsWith("@@")) {
      file.lines.push({ kind: "hunk", text: line });
      const counts = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/.exec(line);
      if (counts) {
        oldLeft = Number(counts[1] ?? 1);
        newLeft = Number(counts[2] ?? 1);
      } else {
        loose = true;
      }
    }
  }
  return files;
};

const ctx = (text: string): DiffLine => ({ kind: "ctx", text });
const del = (text: string): DiffLine => ({ kind: "del", text });
const add = (text: string): DiffLine => ({ kind: "add", text });

/** Above this many cells the diff gives up on alignment: all old lines
 *  removed, then all new lines added. */
const kMaxCells = 4_000_000;

/** A line diff of `before` → `after`: shared lines as context, removals
 *  before additions within each changed run. */
export const lineDiff = (before: string, after: string): DiffLine[] => {
  if (before.endsWith("\n") && after.endsWith("\n")) {
    before = before.slice(0, -1);
    after = after.slice(0, -1);
  }
  const a = before.split("\n");
  const b = after.split("\n");
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  return [
    ...a.slice(0, start).map(ctx),
    ...alignedDiff(a.slice(start, endA), b.slice(start, endB)),
    ...a.slice(endA).map(ctx),
  ];
};

const alignedDiff = (a: string[], b: string[]): DiffLine[] => {
  const n = a.length;
  const m = b.length;
  if (n * m > kMaxCells) return [...a.map(del), ...b.map(add)];
  const w = m + 1;
  const lcs = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * w + j] =
        a[i] === b[j]
          ? lcs[(i + 1) * w + j + 1]! + 1
          : Math.max(lcs[(i + 1) * w + j]!, lcs[i * w + j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push(ctx(a[i]!));
      i++;
      j++;
    } else if (lcs[(i + 1) * w + j]! >= lcs[i * w + j + 1]!) {
      out.push(del(a[i++]!));
    } else {
      out.push(add(b[j++]!));
    }
  }
  while (i < n) out.push(del(a[i++]!));
  while (j < m) out.push(add(b[j++]!));
  return out;
};

/** "+3 −1": lines added and removed, leaving out a zero count. */
export const diffCounts = (lines: DiffLine[]): string => {
  const added = lines.filter((l) => l.kind === "add").length;
  const removed = lines.filter((l) => l.kind === "del").length;
  const parts = [added ? `+${added}` : "", removed ? `−${removed}` : ""];
  return parts.filter(Boolean).join(" ") || "no change";
};
