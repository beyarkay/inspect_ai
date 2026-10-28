/** Longest command shown on the header line; longer ones keep the code block. */
const kMaxLineCommand = 160;

const asCommand = (value: unknown): string | undefined => {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((v) => typeof v === "string"))
    return value.join(" ");
  return undefined;
};

/** The shell command a tool call runs, for the shell tools we know. */
export const shellCommand = (
  tool: string,
  args: Record<string, unknown> | undefined
): string | undefined => {
  if (!args) return undefined;
  switch (tool) {
    case "bash_session":
      return args.action === "type_submit" || args.action === "type"
        ? asCommand(args.input)
        : undefined;
    case "bash":
    case "exec_command":
      return asCommand(args.cmd ?? args.command);
    case "Bash":
    case "shell":
    case "shell_command":
    case "run_shell_command":
      return asCommand(args.command);
    default:
      return undefined;
  }
};

/** One line and short enough to read in the header at a glance. */
export const isSimpleCommand = (command: string): boolean => {
  const trimmed = command.trim();
  return (
    trimmed.length > 0 &&
    trimmed.length <= kMaxLineCommand &&
    !trimmed.includes("\n")
  );
};
