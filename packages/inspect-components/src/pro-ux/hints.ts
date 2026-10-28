const plural = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`;

export interface ModelCallShape {
  /** Input messages the Summary tab shows. */
  shown: number;
  /** Input messages the model received. */
  total: number;
  /** Tool calls in the reply that are logged as the Tool events that follow. */
  toolCalls: string[];
  tools: number;
}

/** Hover hints for a model call's tabs, keyed by tab name. */
export const modelTabHints = ({
  shown,
  total,
  toolCalls,
  tools,
}: ModelCallShape): Record<string, string> => {
  const input =
    shown === 0 && total > 0
      ? `Only the model's reply: its ${plural(total, "input message appears", "input messages appear")} earlier in this transcript.`
      : shown < total
        ? `The newest ${shown} of the ${plural(total, "input message", "input messages")} (the rest appear earlier in this transcript), then the model's reply.`
        : `All ${plural(total, "input message", "input messages")}, then the model's reply.`;
  const calls =
    toolCalls.length > 0
      ? toolCalls.length === 1
        ? ` The reply's tool call (${toolCalls[0]}) appears as the Tool event that follows.`
        : ` The reply's tool calls (${toolCalls.join(", ")}) appear as the Tool events that follow.`
      : "";
  return {
    Summary: input + calls,
    Info: "Token usage, timing, stop reason, generation settings and provider request IDs for this call.",
    Messages: `The exact list of ${plural(total, "message", "messages")} the model received as input, in the order sent, then its reply.`,
    Tools: `The ${plural(tools, "tool", "tools")} offered to the model on this call, with their descriptions, and the tool-choice setting.`,
    API: "The raw JSON request sent to the provider's API, and the raw response it returned.",
  };
};

/** Appended to a model call header's hover text. */
export const modelHeaderHint = (total: number): string =>
  `One call to the model. It received the ${plural(total, "message", "messages")} listed under Messages and replied. Tool calls in its reply run as the Tool events that follow, and each result is input to the model's next call.`;

/** Appended to a tool event header's hover text. */
export const kToolHeaderHint =
  "A tool call the model requested, and its result. The model reads this result as input to its next call.";

export const withHint = (
  subTitle: string | undefined,
  hint: string | false
): string | undefined =>
  hint ? (subTitle ? `${subTitle}\n\n${hint}` : hint) : subTitle;
