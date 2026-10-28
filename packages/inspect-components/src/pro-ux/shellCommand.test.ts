import { describe, expect, it } from "vitest";

import { isSimpleCommand, shellCommand } from "./shellCommand";

describe("shellCommand", () => {
  it("reads bash_session submissions only", () => {
    expect(
      shellCommand("bash_session", {
        action: "type_submit",
        input: "cat app.py",
      })
    ).toBe("cat app.py");
    expect(shellCommand("bash_session", { action: "read" })).toBeUndefined();
  });

  it("reads the command argument of the other shell tools", () => {
    expect(shellCommand("bash", { cmd: "ls -la" })).toBe("ls -la");
    expect(shellCommand("Bash", { command: "pwd" })).toBe("pwd");
    expect(shellCommand("shell", { command: ["git", "status"] })).toBe(
      "git status"
    );
  });

  it("ignores other tools and missing arguments", () => {
    expect(shellCommand("python", { code: "print(1)" })).toBeUndefined();
    expect(shellCommand("bash", undefined)).toBeUndefined();
    expect(shellCommand("bash", { cmd: 3 })).toBeUndefined();
  });
});

describe("isSimpleCommand", () => {
  it("accepts one short line", () => {
    expect(isSimpleCommand("cat app.py")).toBe(true);
    expect(isSimpleCommand("  cat app.py\n")).toBe(true);
  });

  it("rejects heredocs, scripts and very long lines", () => {
    expect(isSimpleCommand("python - <<'PY'\nimport json\nPY")).toBe(false);
    expect(isSimpleCommand("x".repeat(161))).toBe(false);
    expect(isSimpleCommand("   ")).toBe(false);
  });
});
