/** What a stretch of a sample's trajectory was spent on. */
export type SpanKind =
  "system" | "user" | "reasoning" | "assistant" | "tool" | "score" | "error";

/** Okabe–Ito identities, shared by every pro-ux timeline so one colour means
 *  one kind of event everywhere. Error is the only red. */
export const kKindColour: Record<SpanKind, string> = {
  system: "#56B4E9",
  user: "#0072B2",
  reasoning: "#CC79A7",
  assistant: "#009E73",
  tool: "#E69F00",
  score: "#77777f",
  error: "#b00020",
};

export const kKindLabel: Record<SpanKind, string> = {
  system: "system prompt",
  user: "user",
  reasoning: "assistant reasoning",
  assistant: "assistant response",
  tool: "tool call",
  score: "scoring",
  error: "error",
};

export const kKindOrder: SpanKind[] = [
  "system",
  "user",
  "reasoning",
  "assistant",
  "tool",
  "score",
  "error",
];
