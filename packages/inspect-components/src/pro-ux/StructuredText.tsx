import {
  createContext,
  FC,
  ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";

import {
  isInlineElement,
  jsonDepth,
  parseStructured,
  xmlDepth,
  type XmlNode,
} from "./structured";
import { useHtmlFlag } from "./useHtmlFlag";

/** Nodes at this depth or deeper start folded. */
const OpenLevel = createContext(Infinity);

const Toggle: FC<{ open: boolean; onToggle: () => void }> = ({
  open,
  onToggle,
}) => (
  <button
    type="button"
    className="pro-st-toggle"
    aria-expanded={open}
    onClick={onToggle}
  >
    {open ? "▾" : "▸"}
  </button>
);

const JsonValue: FC<{ value: unknown; depth: number }> = ({ value, depth }) => {
  const isArray = Array.isArray(value);
  const isObject = value !== null && typeof value === "object";
  const entries: [string, unknown][] = isObject
    ? isArray
      ? value.map((v, i) => [String(i), v])
      : Object.entries(value)
    : [];
  const [open, setOpen] = useState(depth < useContext(OpenLevel));

  if (!isObject) {
    if (typeof value === "string")
      return <span className="pro-st-str">&quot;{value}&quot;</span>;
    if (typeof value === "number")
      return <span className="pro-st-num">{value}</span>;
    return <span className="pro-st-lit">{String(value)}</span>;
  }
  const [lb, rb] = isArray ? ["[", "]"] : ["{", "}"];
  if (entries.length === 0)
    return (
      <span className="pro-st-punct">
        {lb}
        {rb}
      </span>
    );
  return (
    <span>
      <Toggle open={open} onToggle={() => setOpen(!open)} />
      <span className="pro-st-punct">{lb}</span>
      {open ? (
        <span className="pro-st-block">
          {entries.map(([key, child]) => (
            <span key={key} className="pro-st-row">
              {!isArray && (
                <>
                  <span className="pro-st-key">{key}</span>
                  <span className="pro-st-punct">: </span>
                </>
              )}
              <JsonValue value={child} depth={depth + 1} />
            </span>
          ))}
        </span>
      ) : (
        <button
          type="button"
          className="pro-st-more"
          onClick={() => setOpen(true)}
        >
          {entries.length} {isArray ? "items" : "keys"}
        </button>
      )}
      <span className="pro-st-punct">{rb}</span>
    </span>
  );
};

const XmlElement: FC<{
  node: XmlNode & { type: "element" };
  depth: number;
}> = ({ node, depth }) => {
  const [open, setOpen] = useState(depth < useContext(OpenLevel));
  const attrs = node.attrs.map(([k, v]) => (
    <span key={k}>
      {" "}
      <span className="pro-st-key">{k}</span>
      <span className="pro-st-punct">=</span>
      <span className="pro-st-str">&quot;{v}&quot;</span>
    </span>
  ));
  const openTag = (
    <>
      <span className="pro-st-punct">&lt;</span>
      <span className="pro-st-tag">{node.name}</span>
      {attrs}
      <span className="pro-st-punct">&gt;</span>
    </>
  );
  const closeTag = (
    <>
      <span className="pro-st-punct">&lt;/</span>
      <span className="pro-st-tag">{node.name}</span>
      <span className="pro-st-punct">&gt;</span>
    </>
  );
  const only = node.children[0];
  if (node.children.length === 0) {
    return (
      <span className="pro-st-row pro-st-empty">
        <span className="pro-st-punct">&lt;</span>
        <span className="pro-st-tag">{node.name}</span>
        {attrs}
        <span className="pro-st-punct"> /&gt;</span>
      </span>
    );
  }
  if (isInlineElement(node) && only?.type === "text") {
    return (
      <span className="pro-st-row">
        {openTag}
        <span className="pro-st-text">{only.text.trim()}</span>
        {closeTag}
      </span>
    );
  }
  return (
    <span className="pro-st-row">
      <Toggle open={open} onToggle={() => setOpen(!open)} />
      {openTag}
      {open ? (
        <span className="pro-st-block">
          <XmlNodes nodes={node.children} depth={depth + 1} />
        </span>
      ) : (
        <button
          type="button"
          className="pro-st-more"
          onClick={() => setOpen(true)}
        >
          {node.children.length}{" "}
          {node.children.length === 1 ? "child" : "children"}
        </button>
      )}
      {closeTag}
    </span>
  );
};

const XmlNodes: FC<{ nodes: XmlNode[]; depth: number }> = ({
  nodes,
  depth,
}) => (
  <>
    {nodes.map((node, i) =>
      node.type === "text" ? (
        <span key={i} className="pro-st-row pro-st-text">
          {node.text.trim()}
        </span>
      ) : (
        <XmlElement key={i} node={node} depth={depth} />
      )
    )}
  </>
);

interface DepthControlProps {
  level: number;
  max: number;
  disabled: boolean;
  onLevel: (level: number) => void;
}

/** − depth n/max + all. Widths never change, so repeated clicks stay put. */
const DepthControl: FC<DepthControlProps> = ({
  level,
  max,
  disabled,
  onLevel,
}) => {
  const shown = Math.min(level, max);
  return (
    <span className="pro-st-depth">
      <button
        type="button"
        className="pro-st-step"
        disabled={disabled || shown === 0}
        title="Fold one more level"
        aria-label="Fold one more level"
        onClick={() => onLevel(shown - 1)}
      >
        −
      </button>
      <span
        className="pro-st-level"
        style={{ minWidth: `${String(max).length * 2 + 7}ch` }}
        title="Levels of nesting shown open"
      >
        depth {shown}/{max}
      </span>
      <button
        type="button"
        className="pro-st-step"
        disabled={disabled || shown === max}
        title="Open one more level"
        aria-label="Open one more level"
        onClick={() => onLevel(shown + 1)}
      >
        +
      </button>
      <button
        type="button"
        className="pro-st-step"
        disabled={disabled}
        title="Open every level"
        onClick={() => onLevel(max)}
      >
        all
      </button>
    </span>
  );
};

interface StructuredTextProps {
  text: string;
  /** Rendered unchanged when the text is not JSON or XML, or the pref is off. */
  fallback: ReactNode;
}

/** JSON or XML-ish text as a collapsible, coloured tree, with a raw view. */
export const StructuredText: FC<StructuredTextProps> = ({ text, fallback }) => {
  const enabled = useHtmlFlag("data-pro-smartscores");
  const parsed = useMemo(
    () => (enabled ? parseStructured(text) : null),
    [enabled, text]
  );
  const max = useMemo(
    () =>
      parsed?.kind === "json"
        ? jsonDepth(parsed.value)
        : parsed?.kind === "xml"
          ? xmlDepth(parsed.nodes)
          : 0,
    [parsed]
  );
  const [raw, setRaw] = useState(false);
  const [level, setLevel] = useState(Infinity);
  // Remounts the tree on every depth click, so each node re-reads its open
  // state from the new level and earlier hand toggles are discarded.
  const [generation, setGeneration] = useState(0);

  if (!parsed || (parsed.kind === "text" && !parsed.note)) return fallback;

  const label =
    parsed.kind === "json" ? "JSON" : parsed.kind === "xml" ? "XML" : "text";
  return (
    <div className="pro-st">
      <div className="pro-st-bar">
        <span>{label}</span>
        {max > 0 && (
          <DepthControl
            level={level}
            max={max}
            disabled={raw}
            onLevel={(next) => {
              setLevel(next);
              setGeneration(generation + 1);
            }}
          />
        )}
        {parsed.kind !== "text" && (
          <button
            type="button"
            className="pro-st-mode"
            onClick={() => setRaw(!raw)}
          >
            {raw ? "show tree" : "show raw"}
          </button>
        )}
        {parsed.note && <span className="pro-st-note">{parsed.note}</span>}
      </div>
      {raw || parsed.kind === "text" ? (
        <pre className="pro-st-raw">{text}</pre>
      ) : (
        <OpenLevel.Provider value={level}>
          <div className="pro-st-tree" key={generation}>
            {parsed.kind === "json" ? (
              <JsonValue value={parsed.value} depth={0} />
            ) : (
              <XmlNodes nodes={parsed.nodes} depth={0} />
            )}
          </div>
        </OpenLevel.Provider>
      )}
    </div>
  );
};
