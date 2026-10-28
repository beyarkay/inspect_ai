import { FC } from "react";

interface ContextCaptionProps {
  /** Input messages the summary shows. */
  shown: number;
  total: number;
}

/** Above a model call's summary: how much of the model's input is shown. */
export const ModelContextCaption: FC<ContextCaptionProps> = ({
  shown,
  total,
}) =>
  shown < total ? (
    <div className="pro-turn-caption">
      Model input: <b>{total}</b> {total === 1 ? "message" : "messages"},{" "}
      {shown} shown here. The rest appear earlier in this transcript; the{" "}
      <b>Messages</b> tab lists all {total} exactly as sent.
    </div>
  ) : null;

interface OutputCaptionProps {
  calls: string[];
}

/** Below a model call's summary: tool calls whose results are logged as the next events. */
export const ModelOutputCaption: FC<OutputCaptionProps> = ({ calls }) =>
  calls.length > 0 ? (
    <div className="pro-turn-caption pro-turn-output">
      The model replied with {calls.length === 1 ? "a tool call" : "tool calls"}
      : <b>{calls.join(", ")}</b>. Inspect logs each call and its result as the
      Tool event that follows; the result reaches the model as input to its next
      call.
    </div>
  ) : null;
