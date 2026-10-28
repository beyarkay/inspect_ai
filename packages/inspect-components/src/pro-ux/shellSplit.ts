/** A display line break after a top-level separator ending at `at`; the next
 *  line starts at `next`, past the spaces that followed the separator. */
export interface ShellBreak {
  at: number;
  next: number;
}

type Frame = "(" | "{" | "`" | '"' | "[[" | "if" | "loop";

const kWordEnd = /[\s;&|()<>]/;
const kWord = /[a-z]+/y;
/** Keywords after which the next word is again a command. */
const kKeepsCommand = new Set([
  "if",
  "then",
  "else",
  "elif",
  "do",
  "while",
  "until",
  "time",
]);

/**
 * Where each top-level `;`, `&&` and `||` ends, skipping any inside quotes,
 * `$(...)`, backticks, braces, `[[ ]]`, `if … fi` and loops. Undefined when
 * the structure is unclear: unbalanced quotes or brackets, a heredoc, or a
 * case statement.
 */
export const topLevelBreaks = (command: string): ShellBreak[] | undefined => {
  const n = command.length;
  const stack: Frame[] = [];
  const breaks: ShellBreak[] = [];
  const top = () => stack[stack.length - 1];
  const atWordStart = (j: number) => j === 0 || kWordEnd.test(command[j - 1]!);
  const endsWord = (j: number) => j >= n || kWordEnd.test(command[j]!);
  let commandStart = true;
  let i = 0;

  const separator = (end: number) => {
    commandStart = true;
    if (stack.length > 0) return;
    let next = end;
    while (command[next] === " " || command[next] === "\t") next++;
    if (next < n && command[next] !== "\n") breaks.push({ at: end, next });
  };

  while (i < n) {
    const c = command[i]!;
    const d = command[i + 1];

    if (top() === '"') {
      if (c === "\\") i += 2;
      else if (c === '"') {
        stack.pop();
        i++;
      } else if (c === "`") {
        stack.push("`");
        commandStart = true;
        i++;
      } else if (c === "$" && (d === "(" || d === "{")) {
        stack.push(d);
        commandStart = d === "(";
        i += 2;
      } else i++;
      continue;
    }

    if (c === "\\") {
      commandStart = false;
      i += 2;
      continue;
    }
    if (c === "'" || (c === "$" && d === "'")) {
      let j = c === "'" ? i + 1 : i + 2;
      while (j < n && command[j] !== "'")
        j += c === "$" && command[j] === "\\" ? 2 : 1;
      if (j >= n) return undefined;
      commandStart = false;
      i = j + 1;
      continue;
    }
    if (c === '"') {
      stack.push('"');
      commandStart = false;
      i++;
      continue;
    }
    if (c === "`") {
      if (top() === "`") {
        stack.pop();
        commandStart = false;
      } else {
        stack.push("`");
        commandStart = true;
      }
      i++;
      continue;
    }
    if (c === "#" && atWordStart(i)) {
      const eol = command.indexOf("\n", i);
      i = eol < 0 ? n : eol;
      continue;
    }
    if (c === "$" && (d === "(" || d === "{")) {
      stack.push(d);
      commandStart = d === "(";
      i += 2;
      continue;
    }
    if (c === "(" || c === "{") {
      commandStart = c === "(" || (atWordStart(i) && /\s/.test(d ?? ""));
      stack.push(c);
      i++;
      continue;
    }
    if (c === ")" || c === "}") {
      if (top() !== (c === ")" ? "(" : "{")) return undefined;
      stack.pop();
      commandStart = false;
      i++;
      continue;
    }
    if (c === "<" && d === "<") {
      if (command[i + 2] !== "<") return undefined;
      i += 3;
      continue;
    }
    if (c === ";") {
      if (d === ";" || d === "&") return undefined;
      separator(i + 1);
      i++;
      continue;
    }
    if ((c === "&" || c === "|") && d === c) {
      separator(i + 2);
      i += 2;
      continue;
    }
    if (c === "&" || c === "|" || c === "\n") {
      commandStart = true;
      i++;
      continue;
    }

    if (atWordStart(i)) {
      if (command.startsWith("[[", i) && endsWord(i + 2)) {
        stack.push("[[");
        commandStart = false;
        i += 2;
        continue;
      }
      if (command.startsWith("]]", i) && endsWord(i + 2)) {
        if (top() !== "[[") return undefined;
        stack.pop();
        i += 2;
        continue;
      }
      kWord.lastIndex = i;
      const word = kWord.exec(command)?.[0];
      if (word && commandStart && endsWord(i + word.length)) {
        if (word === "case" || word === "esac") return undefined;
        if (word === "if") stack.push("if");
        if (["for", "while", "until", "select"].includes(word))
          stack.push("loop");
        if (word === "fi" || word === "done") {
          if (top() !== (word === "fi" ? "if" : "loop")) return undefined;
          stack.pop();
        }
        commandStart = kKeepsCommand.has(word);
        i += word.length;
        continue;
      }
    }
    if (!/\s/.test(c)) commandStart = false;
    i++;
  }

  return stack.length === 0 ? breaks : undefined;
};

/** The command with a line break after each top-level `;`, `&&` and `||`,
 *  operators kept at the line end. Undefined when there is nothing to split
 *  or splitting is unsafe. */
export const prettifyShell = (command: string): string | undefined => {
  const breaks = topLevelBreaks(command);
  if (!breaks?.length) return undefined;
  let out = "";
  let from = 0;
  for (const b of breaks) {
    out += `${command.slice(from, b.at)}\n`;
    from = b.next;
  }
  return out + command.slice(from);
};
