import JSON5 from "json5";

export type XmlNode =
  | {
      type: "element";
      name: string;
      attrs: [string, string][];
      children: XmlNode[];
    }
  | { type: "text"; text: string };

export type Structured =
  | { kind: "json"; value: unknown; note?: string }
  | { kind: "xml"; nodes: XmlNode[]; note?: string }
  | { kind: "text"; note?: string };

const kFence = /^```(?:json|xml|html)?\s*\n([\s\S]*?)\n?```$/i;

const unfence = (text: string): string => {
  const match = kFence.exec(text.trim());
  return match?.[1] ?? text.trim();
};

/** End index (exclusive) of the bracketed value starting at 0, string-aware. */
const balancedEnd = (text: string): number | null => {
  const open = text[0];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) return i + 1;
  }
  return null;
};

const parseJson = (text: string): Structured => {
  try {
    return { kind: "json", value: JSON.parse(text) };
  } catch (strictError) {
    try {
      return {
        kind: "json",
        value: JSON5.parse(text),
        note: "parsed leniently (comments, trailing commas or single quotes)",
      };
    } catch {
      const end = balancedEnd(text);
      if (end !== null && end < text.length) {
        try {
          return {
            kind: "json",
            value: JSON.parse(text.slice(0, end)),
            note: `ignored ${text.length - end} trailing characters after the JSON`,
          };
        } catch {
          // Fall through to the raw text below.
        }
      }
      const message =
        strictError instanceof Error
          ? strictError.message
          : String(strictError);
      return {
        kind: "text",
        note: `looks like JSON but did not parse (${message}); showing it as written`,
      };
    }
  }
};

const kEntities: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
  "&quot;": '"',
  "&apos;": "'",
};

const decode = (text: string): string =>
  text.replace(/&(lt|gt|amp|quot|apos);/g, (m) => kEntities[m] ?? m);

const kToken =
  /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([A-Za-z_][\w.\-:]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g;
const kAttr = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

/** A forgiving XML-ish parser: mismatched closes pop to the nearest match and
 *  anything left open is closed at the end. Returns null when there are no
 *  tags at all. */
export const parseXml = (
  text: string
): { nodes: XmlNode[]; repairs: number } | null => {
  const root: XmlNode & { type: "element" } = {
    type: "element",
    name: "",
    attrs: [],
    children: [],
  };
  const stack: (XmlNode & { type: "element" })[] = [root];
  let repairs = 0;
  let last = 0;
  let sawTag = false;
  const top = () => stack[stack.length - 1] ?? root;
  const pushText = (raw: string) => {
    if (raw.trim()) top().children.push({ type: "text", text: decode(raw) });
  };

  for (const m of text.matchAll(kToken)) {
    pushText(text.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[0].startsWith("<!--")) continue;
    if (m[1] !== undefined) {
      top().children.push({ type: "text", text: m[1] });
      continue;
    }
    sawTag = true;
    const [, , closing, name = "", attrText = "", selfClosing] = m;
    if (closing) {
      const at = stack.map((s) => s.name).lastIndexOf(name);
      if (at <= 0) {
        repairs++;
        continue;
      }
      repairs += stack.length - 1 - at;
      stack.length = at;
      continue;
    }
    const attrs: [string, string][] = Array.from(
      attrText.matchAll(kAttr),
      (a) => [a[1] ?? "", decode(a[2] ?? a[3] ?? a[4] ?? "")]
    );
    const element: XmlNode & { type: "element" } = {
      type: "element",
      name,
      attrs,
      children: [],
    };
    top().children.push(element);
    if (!selfClosing) stack.push(element);
  }
  pushText(text.slice(last));
  if (!sawTag) return null;
  repairs += stack.length - 1;
  return { nodes: root.children, repairs };
};

const kClosingTag = /<\/([A-Za-z_][\w.\-:]*)\s*>/;

export const parseStructured = (text: string): Structured => {
  const body = unfence(text);
  if (body.startsWith("{") || body.startsWith("[")) return parseJson(body);
  if (body.startsWith("<") || kClosingTag.test(body)) {
    const parsed = parseXml(body);
    if (parsed && parsed.nodes.some((n) => n.type === "element")) {
      return {
        kind: "xml",
        nodes: parsed.nodes,
        note:
          parsed.repairs > 0
            ? `repaired ${parsed.repairs} unbalanced ${parsed.repairs === 1 ? "tag" : "tags"}`
            : undefined,
      };
    }
  }
  return { kind: "text" };
};
