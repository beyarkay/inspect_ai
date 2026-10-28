import { describe, expect, it } from "vitest";

import { prettifyShell } from "./shellSplit";

const lines = (command: string) => prettifyShell(command)?.split("\n");

describe("prettifyShell", () => {
  it("breaks after each top-level semicolon", () => {
    expect(
      lines(
        "pwd; git status --short; git log -3 --oneline; fd -t f . public | head -8; rg -n 'a|b' public; cat package.json; sed -n '1,160p' server/main.py"
      )
    ).toEqual([
      "pwd;",
      "git status --short;",
      "git log -3 --oneline;",
      "fd -t f . public | head -8;",
      "rg -n 'a|b' public;",
      "cat package.json;",
      "sed -n '1,160p' server/main.py",
    ]);
  });

  it("keeps && and || at the end of their line", () => {
    expect(lines("cd /repo && make || echo failed")).toEqual([
      "cd /repo &&",
      "make ||",
      "echo failed",
    ]);
  });

  it("keeps pipes, redirections and background jobs on one line", () => {
    expect(lines("npm test 2>&1 | grep -v warn | head -20 && echo ok")).toEqual(
      ["npm test 2>&1 | grep -v warn | head -20 &&", "echo ok"]
    );
    expect(lines("sleep 1 & echo started; wait")).toEqual([
      "sleep 1 & echo started;",
      "wait",
    ]);
    expect(prettifyShell("ps aux | grep python | wc -l")).toBeUndefined();
  });

  it("ignores separators inside single and double quotes", () => {
    expect(lines("echo 'a; b && c'; ls")).toEqual(["echo 'a; b && c';", "ls"]);
    expect(lines('echo "a; b || c"; ls')).toEqual(['echo "a; b || c";', "ls"]);
    expect(lines("rg -n 'foo;bar|baz' src && echo hit")).toEqual([
      "rg -n 'foo;bar|baz' src &&",
      "echo hit",
    ]);
  });

  it("handles escaped quotes and escaped semicolons", () => {
    expect(lines('echo "say \\"hi; there\\""; ls')).toEqual([
      'echo "say \\"hi; there\\"";',
      "ls",
    ]);
    expect(lines("echo it\\'s; ls")).toEqual(["echo it\\'s;", "ls"]);
    expect(lines("find . -name '*.py' -exec wc -l {} \\; ; echo done")).toEqual(
      ["find . -name '*.py' -exec wc -l {} \\; ;", "echo done"]
    );
    expect(lines("echo $'it\\'s; fine'; ls")).toEqual([
      "echo $'it\\'s; fine';",
      "ls",
    ]);
  });

  it("ignores separators inside command substitution and backticks", () => {
    expect(lines("echo $(date; whoami) && ls")).toEqual([
      "echo $(date; whoami) &&",
      "ls",
    ]);
    expect(lines('echo "$(echo "a; b"; echo c)"; ls')).toEqual([
      'echo "$(echo "a; b"; echo c)";',
      "ls",
    ]);
    expect(lines("echo `date; whoami`; ls")).toEqual([
      "echo `date; whoami`;",
      "ls",
    ]);
    expect(lines("diff <(sort a; echo) b; ls")).toEqual([
      "diff <(sort a; echo) b;",
      "ls",
    ]);
  });

  it("keeps brace groups, subshells and parameter expansions whole", () => {
    expect(lines("{ make; make test; } > log.txt; cat log.txt")).toEqual([
      "{ make; make test; } > log.txt;",
      "cat log.txt",
    ]);
    expect(lines("(cd sub; make) && echo built")).toEqual([
      "(cd sub; make) &&",
      "echo built",
    ]);
    expect(lines("echo ${x:-a;b}; ls")).toEqual(["echo ${x:-a;b};", "ls"]);
    expect(lines("[[ -n $x && -f $y ]] && echo yes")).toEqual([
      "[[ -n $x && -f $y ]] &&",
      "echo yes",
    ]);
  });

  it("keeps loops and conditionals on one line", () => {
    expect(
      lines("cd src && for f in *.py; do wc -l $f; done; echo end")
    ).toEqual(["cd src &&", "for f in *.py; do wc -l $f; done;", "echo end"]);
    expect(lines("if [ -f x ]; then cat x; else echo no; fi && ls")).toEqual([
      "if [ -f x ]; then cat x; else echo no; fi &&",
      "ls",
    ]);
    expect(lines("while read l; do echo $l; done < f; echo done")).toEqual([
      "while read l; do echo $l; done < f;",
      "echo done",
    ]);
  });

  it("treats keywords as words outside command position", () => {
    expect(lines("echo if then fi; echo done")).toEqual([
      "echo if then fi;",
      "echo done",
    ]);
  });

  it("does not split comments", () => {
    expect(lines("ls; # it's; not split")).toEqual([
      "ls;",
      "# it's; not split",
    ]);
    expect(prettifyShell("ls # don't; split")).toBeUndefined();
  });

  it("leaves existing line breaks alone", () => {
    expect(lines("a;\n  b; c")).toEqual(["a;", "  b;", "c"]);
    expect(prettifyShell("a &&\nb")).toBeUndefined();
  });

  it("allows here-strings but refuses heredocs", () => {
    expect(lines('cat <<< "a;b"; ls')).toEqual(['cat <<< "a;b";', "ls"]);
    expect(prettifyShell("cat <<EOF\na; b\nEOF\necho hi; ls")).toBeUndefined();
    expect(
      prettifyShell("python - <<'PY'\nprint(1); print(2)\nPY")
    ).toBeUndefined();
  });

  it("refuses anything unbalanced or ambiguous", () => {
    expect(prettifyShell("echo 'oops; ls")).toBeUndefined();
    expect(prettifyShell('echo "oops; ls')).toBeUndefined();
    expect(prettifyShell("echo $(date; ls")).toBeUndefined();
    expect(prettifyShell("echo a) ; ls")).toBeUndefined();
    expect(prettifyShell("echo } ; ls")).toBeUndefined();
    expect(prettifyShell("echo `date; ls")).toBeUndefined();
    expect(prettifyShell("case $x in a) echo a;; esac; ls")).toBeUndefined();
    expect(prettifyShell("done; ls")).toBeUndefined();
  });

  it("returns undefined when there is one statement", () => {
    expect(prettifyShell("ls -la")).toBeUndefined();
    expect(prettifyShell("echo hi;")).toBeUndefined();
    expect(prettifyShell("")).toBeUndefined();
  });

  it("splits without spaces and keeps a trailing separator", () => {
    expect(lines("echo hi;ls&&pwd")).toEqual(["echo hi;", "ls&&", "pwd"]);
    expect(lines("a; b;")).toEqual(["a;", "b;"]);
  });
});
