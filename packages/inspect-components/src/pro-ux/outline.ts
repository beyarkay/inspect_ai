import { EventNode } from "../transcript/types";

const kPreviewChars = 140;

const labels = new WeakMap<EventNode, string>();

/** Synchronous read of a pro-UX flag on <html>, for non-React callers. */
export const isHtmlFlagOn = (name: string): boolean =>
  typeof document !== "undefined" &&
  document.documentElement.hasAttribute("data-pro-ux") &&
  document.documentElement.hasAttribute(name);

const squash = (text: string): string =>
  text.replace(/\s+/g, " ").trim().slice(0, kPreviewChars);

const textOf = (content: unknown): string => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: unknown[] = content;
  for (const part of parts) {
    if (part && typeof part === "object" && "type" in part) {
      if (
        part.type === "text" &&
        "text" in part &&
        typeof part.text === "string"
      )
        return part.text;
    }
  }
  return "";
};

const kArgPriority = [
  "cmd",
  "command",
  "input",
  "code",
  "query",
  "path",
  "file",
  "url",
];

/** The most telling argument of a tool call, as one line. */
export const argumentPreview = (args: Record<string, unknown>): string => {
  const key =
    kArgPriority.find((k) => args[k] !== undefined && args[k] !== "") ??
    Object.keys(args).find((k) => typeof args[k] === "string");
  if (key === undefined) return "";
  const value = args[key];
  return squash(typeof value === "string" ? value : JSON.stringify(value));
};

const modelPreview = (node: EventNode): string => {
  if (node.event.event !== "model") return "";
  const message = node.event.output.choices[0]?.message;
  if (!message) return "";
  const text = squash(textOf(message.content));
  if (text) return text;
  const calls = message.tool_calls?.map((c) => c.function) ?? [];
  return calls.length > 0 ? `→ ${calls.join(", ")}` : "";
};

const toolLabel = (node: EventNode): string | undefined => {
  if (node.event.event !== "tool") return undefined;
  const preview = argumentPreview(node.event.arguments);
  return preview ? `${node.event.function}: ${preview}` : node.event.function;
};

/**
 * Inline each turn's tool calls under it (instead of folding runs of turns
 * into one "N turns" row) and label turns with the model's reply. The turn
 * row already carries the model event's id, so the model node itself is not
 * repeated.
 */
export const expandTurns = (
  nodes: EventNode[],
  collapsedIds: Record<string, boolean>
): EventNode[] => {
  const out: EventNode[] = [];
  for (const node of nodes) {
    out.push(node);
    if (node.event.event !== "span_begin" || node.event.type !== "turn") {
      continue;
    }
    const [model, ...rest] = node.children;
    const preview = model ? modelPreview(model) : "";
    labels.set(
      node,
      preview ? `${node.event.name} · ${preview}` : node.event.name
    );
    node.children = rest.filter((child) => child.event.event === "tool");
    if (collapsedIds[node.id]) continue;
    for (const child of node.children) {
      const row = new EventNode(child.id, child.event, node.depth + 1);
      const label = toolLabel(child);
      if (label) labels.set(row, label);
      out.push(row);
    }
  }
  return out;
};

/** The detailed label for an outline row, when expandTurns made one. */
export const outlineLabel = (node: EventNode): string | undefined =>
  labels.get(node);
