import { useHtmlFlag } from "./useHtmlFlag";

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

export interface ShellView {
  /** A simple command, printed as the header line. */
  line?: string;
  /** A script or long command, shown as a highlighted block. */
  block?: string;
}

/** How pro-ux shows a shell call; empty when pro-ux is off or the tool is
 *  not a shell, so the usual rendering applies. */
export const useShellView = (
  tool: string,
  args: Record<string, unknown> | undefined
): ShellView => {
  const pro = useHtmlFlag("data-pro-ux");
  if (!pro) return {};
  const command = shellCommand(tool, args);
  if (command === undefined) return {};
  return isSimpleCommand(command)
    ? { line: command.trim() }
    : { block: command };
};
