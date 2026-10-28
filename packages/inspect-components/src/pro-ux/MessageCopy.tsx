import { FC, useState } from "react";

import type { ChatMessage } from "@tsmono/inspect-common/types";

import { useHtmlFlag } from "./useHtmlFlag";

const kOmittedName: Record<string, string> = {
  reasoning: "reasoning",
  image: "images",
  audio: "audio",
  video: "video",
  data: "data",
  document: "documents",
  tool_use: "server tool calls",
};

export interface CopyText {
  text: string;
  /** What the copy says it does. */
  hint: string;
}

/** A user or assistant message's text exactly as sent: string content
 *  verbatim, text blocks joined by a blank line. Null for other roles or no
 *  text. */
export const messageCopyText = (message: ChatMessage): CopyText | null => {
  if (message.role !== "user" && message.role !== "assistant") return null;
  const content = message.content;
  const blocks =
    typeof content === "string"
      ? [content]
      : content.flatMap((c) => (c.type === "text" ? [c.text] : []));
  const text = blocks.join("\n\n");
  if (!text.trim()) return null;

  const omitted = new Set<string>();
  if (typeof content !== "string") {
    for (const c of content) {
      if (c.type !== "text") omitted.add(kOmittedName[c.type] ?? c.type);
    }
  }
  if (message.role === "assistant" && message.tool_calls?.length) {
    omitted.add("tool calls");
  }

  const source =
    message.role === "assistant"
      ? "exactly as the model returned it"
      : "exactly as sent to the model";
  const joined =
    blocks.length > 1
      ? ` (${blocks.length} text blocks, joined by a blank line)`
      : "";
  const left =
    omitted.size > 0 ? `; leaves out ${[...omitted].join(" and ")}` : "";
  return { text, hint: `Copy this message's text ${source}${joined}${left}` };
};

const writeClipboard = async (text: string): Promise<void> => {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
};

const CopyIcon: FC = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    aria-hidden
  >
    <rect x="5.5" y="5.5" width="8" height="8" rx="1" />
    <path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" />
  </svg>
);

const DoneIcon: FC = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    aria-hidden
  >
    <path d="M3 8.5l3 3 7-7" />
  </svg>
);

const CopyButton: FC<{ copy: CopyText; visible: boolean }> = ({
  copy,
  visible,
}) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={[
        "pro-msg-copy",
        visible ? "pro-msg-copy-on" : "",
        copied ? "pro-msg-copied" : "",
      ].join(" ")}
      title={copy.hint}
      aria-label={copy.hint}
      onClick={(e) => {
        e.stopPropagation();
        writeClipboard(copy.text)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 900);
          })
          .catch(() => undefined);
      }}
    >
      {copied ? <DoneIcon /> : <CopyIcon />}
      {copied && <span className="pro-msg-copy-done">copied</span>}
    </button>
  );
};

/** The copy button for a message header, or null when pro-ux is off or the
 *  message has no text to copy. */
export const useMessageCopyButton = (
  message: ChatMessage,
  visible: boolean
) => {
  const enabled = useHtmlFlag("data-pro-ux");
  const copy = enabled ? messageCopyText(message) : null;
  return copy ? <CopyButton copy={copy} visible={visible} /> : null;
};
