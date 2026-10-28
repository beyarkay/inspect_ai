import "./toolViews.css";

import clsx from "clsx";
import { FC, ReactNode, useMemo, useRef, useState } from "react";

import {
  ContentCode,
  ContentText,
  ExpandablePanel,
} from "@tsmono/react/components";
import { useEventListener, usePrismHighlight } from "@tsmono/react/hooks";
import type { IconName } from "@tsmono/react/icons";
import { parseJsonRecord } from "@tsmono/util";

import type { ToolCallViewProps } from "../chat/tools/ToolCallView";
import { ToolInput } from "../chat/tools/ToolInput";
import { cappedText } from "../content/cappedText";
import { useDisplayMode } from "../content/DisplayModeContext";

import type { DiffFile, DiffLine } from "./diff";
import { isSimpleCommand } from "./shellCommand";
import { prettifyShell } from "./shellSplit";
import {
  fileOp,
  FileSection,
  fileSections,
  languageForPath,
  numberedListing,
  toolView,
} from "./toolViews";
import { useHtmlFlag } from "./useHtmlFlag";

type Output = ToolCallViewProps["output"];

export interface ProToolCall {
  icon?: IconName;
  /** Replaces the tool name in the header. */
  line?: string;
  summary?: string;
  className?: string;
  /** Replaces the input zone's contents. */
  input?: ReactNode;
  /** A control pinned to the header's right edge. */
  control?: ReactNode;
  /** Replaces the output well's contents; undefined keeps the usual view. */
  output?: (output: Output) => ReactNode | undefined;
}

/** How pro-ux shows a tool call; empty when pro-ux is off or the tool is not
 *  one it knows, so the usual rendering applies. */
export const useProToolCall = (
  tool: string,
  args: Record<string, unknown> | undefined,
  id: string
): ProToolCall => {
  const enabled = useHtmlFlag("data-pro-ux");
  const rendered = useDisplayMode() === "rendered";
  const [pretty, setPretty] = useState(false);
  const view = useMemo(
    () => (enabled ? toolView(tool, args) : undefined),
    [enabled, tool, args]
  );
  const command = view?.kind === "shell" ? view.command.trim() : undefined;
  const prettified = useMemo(
    () => (command !== undefined ? prettifyShell(command) : undefined),
    [command]
  );
  if (!view) return {};

  const fileOutput = (paths: string[]) =>
    rendered
      ? (output: Output) => {
          const text = plainOutput(output);
          if (text === undefined) return undefined;
          if (languageForPath(paths[0]!) === "json" && parseJsonRecord(text))
            return undefined;
          return <FileOutput id={id} text={text} paths={paths} />;
        }
      : undefined;

  switch (view.kind) {
    case "shell": {
      const original = command!;
      const shown = pretty && prettified ? prettified : original;
      const control = prettified ? (
        <PrettifyToggle
          on={pretty}
          onToggle={() => setPretty((p) => !p)}
          original={original}
          shown={shown}
        />
      ) : undefined;
      const common = {
        control,
        output: view.reads ? fileOutput(view.reads) : undefined,
      };
      return isSimpleCommand(original)
        ? {
            ...common,
            line: shown,
            className: clsx(
              "pro-tool-line pro-shell-line",
              control && "pro-has-control"
            ),
          }
        : {
            ...common,
            className: clsx(control && "pro-has-control"),
            input: (
              <ToolInput
                key={shown === original ? "as-sent" : "prettified"}
                contentType="bash"
                contents={shown}
              />
            ),
          };
    }
    case "patch":
      return {
        icon: "edit",
        line: view.files.map((f) => f.path).join(", "),
        summary: view.note,
        className: "pro-tool-line",
        input: view.files.some((f) => f.lines.length > 0) ? (
          <DiffView files={view.files} labelled={view.files.length > 1} />
        ) : undefined,
      };
    case "read":
      return {
        icon: "fileText",
        line: view.paths.join(", "),
        summary: view.range,
        className: "pro-tool-line",
        output: fileOutput(view.paths),
      };
    case "edit":
      return {
        icon: "edit",
        line: view.path,
        summary: view.note,
        className: "pro-tool-line",
        input: (
          <DiffView
            files={[{ path: view.path, op: "update", lines: view.lines }]}
            labelled={false}
          />
        ),
      };
    case "write":
      return {
        icon: "edit",
        line: view.path,
        summary: view.note,
        className: "pro-tool-line",
        input: view.text ? (
          <ToolInput
            contentType={languageForPath(view.path)}
            contents={view.text}
          />
        ) : undefined,
      };
    case "line":
      return {
        icon: view.icon,
        line: view.text,
        summary: view.note,
        className: "pro-tool-line",
      };
  }
};

/** The output's text, when it is only text. */
const plainOutput = (output: Output): string | undefined => {
  if (typeof output === "string") return output;
  if (typeof output !== "object") return undefined;
  const texts: string[] = [];
  for (const item of Array.isArray(output) ? output : [output]) {
    if (item.type === "text") texts.push(item.text);
    else if (item.type === "tool") {
      for (const c of item.content) {
        if (c.type !== "text") return undefined;
        texts.push(c.text);
      }
    } else return undefined;
  }
  return texts.length > 0 ? texts.join("\n") : undefined;
};

const PrettifyToggle: FC<{
  on: boolean;
  onToggle: () => void;
  original: string;
  shown: string;
}> = ({ on, onToggle, original, shown }) => {
  const ref = useRef<HTMLButtonElement>(null);
  useEventListener(on ? document : null, "copy", (e) => {
    const selection = document.getSelection();
    const block = ref.current?.parentElement;
    if (!selection?.anchorNode || !block?.contains(selection.anchorNode))
      return;
    if (selection.toString().trim() !== shown.trim()) return;
    e.clipboardData?.setData("text/plain", original);
    e.preventDefault();
  });
  return (
    <button
      ref={ref}
      type="button"
      className={clsx("pro-prettify", on && "pro-prettify-on")}
      aria-pressed={on}
      title={
        on
          ? "Showing one command per line. Click to show the command as sent."
          : "Show one command per line, breaking after each top-level ; && and ||. Display only: copying the whole command copies it as sent."
      }
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      prettify
    </button>
  );
};

const kSign: Record<"add" | "del" | "ctx", string> = {
  add: "+",
  del: "−",
  ctx: " ",
};

const DiffRow: FC<{ line: DiffLine }> = ({ line }) => {
  if (line.kind === "hunk") {
    return (
      <div className="pro-diff-hunk">
        {line.text === "@@" ? "⋯" : <ContentText text={line.text} />}
      </div>
    );
  }
  if (line.kind === "note") {
    return (
      <div className="pro-diff-note">
        <ContentText text={line.text} />
      </div>
    );
  }
  return (
    <div className={`pro-diff-line pro-diff-${line.kind}`}>
      <span className="pro-diff-sign" aria-hidden>
        {kSign[line.kind]}
      </span>
      <span className="pro-diff-text">
        <ContentText text={line.text} />
      </span>
    </div>
  );
};

/** Lines added on a green tint, removed on a red one; file paths as labels
 *  when the patch touches more than one file. */
export const DiffView: FC<{ files: DiffFile[]; labelled: boolean }> = ({
  files,
  labelled,
}) => (
  <div className="pro-diff tool-call-input">
    {files.map((file, i) => (
      <div key={i} className="pro-diff-file">
        {labelled ? (
          <div className="pro-diff-label">
            <ContentText text={file.path} />
            {fileOp(file) ? (
              <span className="pro-diff-op">{fileOp(file)}</span>
            ) : null}
          </div>
        ) : null}
        {file.lines.map((line, j) =>
          j === 0 && line.kind === "hunk" && line.text === "@@" ? null : (
            <DiffRow key={j} line={line} />
          )
        )}
      </div>
    ))}
  </div>
);

const FileSectionView: FC<{ section: FileSection; language?: string }> = ({
  section,
  language,
}) => {
  const listing = numberedListing(section.text);
  const codeClass = clsx("sourceCode", language && `language-${language}`);
  return (
    <div className="pro-file-section">
      {section.path !== undefined ? (
        <div className="pro-file-label">
          <ContentText text={section.path} />
        </div>
      ) : null}
      {listing ? (
        <>
          {listing.before ? (
            <pre className="pro-file-note">
              <ContentText text={listing.before} />
            </pre>
          ) : null}
          <div className="pro-file-grid">
            <pre className="pro-file-gutter" aria-hidden>
              {listing.numbers.join("\n")}
            </pre>
            <pre className="pro-file-code">
              <ContentCode className={codeClass} text={listing.code} />
            </pre>
          </div>
          {listing.after ? (
            <pre className="pro-file-note">
              <ContentText text={listing.after} />
            </pre>
          ) : null}
        </>
      ) : (
        <pre className="pro-file-code pro-file-wrap">
          <ContentCode className={codeClass} text={section.text} />
        </pre>
      )}
    </div>
  );
};

/** A file's contents, highlighted by its extension, with `cat -n` style line
 *  numbers moved to a gutter. */
const FileOutput: FC<{ id: string; text: string; paths: string[] }> = ({
  id,
  text,
  paths,
}) => {
  const { text: capped, notice } = cappedText(text);
  const sections = useMemo(
    () => fileSections(capped.replace(/^\s*\n/, ""), paths),
    [capped, paths]
  );
  const ref = useRef<HTMLDivElement>(null);
  usePrismHighlight(ref, capped.length);
  return (
    <ExpandablePanel
      id={`${id}-tool-content`}
      collapse={true}
      border={false}
      lines={15}
      className="text-size-small"
    >
      <div ref={ref} className="pro-file-output">
        {sections.map((section, i) => (
          <FileSectionView
            key={i}
            section={section}
            language={languageForPath(section.path ?? paths[0]!)}
          />
        ))}
      </div>
      {notice}
    </ExpandablePanel>
  );
};
