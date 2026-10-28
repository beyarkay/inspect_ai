import { describe, expect, it } from "vitest";

import { parseStructured, parseXml } from "./structured";

describe("parseStructured — JSON", () => {
  it("parses strict JSON objects and arrays", () => {
    expect(parseStructured('{"a": 1, "b": [true, null]}')).toEqual({
      kind: "json",
      value: { a: 1, b: [true, null] },
    });
    expect(parseStructured("[1, 2]")).toEqual({ kind: "json", value: [1, 2] });
  });

  it("unwraps a fenced block", () => {
    expect(parseStructured('```json\n{"ok": true}\n```')).toEqual({
      kind: "json",
      value: { ok: true },
    });
  });

  it("falls back to JSON5 and says so", () => {
    const parsed = parseStructured("{a: 1, 'b': 2,}");
    expect(parsed.kind).toBe("json");
    expect(parsed).toMatchObject({ value: { a: 1, b: 2 } });
    expect(parsed.note).toMatch(/leniently/);
  });

  it("drops trailing prose after a complete object", () => {
    const parsed = parseStructured(
      '{"score": 3, "why": "a } in a string"} done.'
    );
    expect(parsed).toMatchObject({
      kind: "json",
      value: { score: 3, why: "a } in a string" },
    });
    expect(parsed.note).toMatch(/ignored 6 trailing characters/);
  });

  it("keeps broken JSON as text with the parse error", () => {
    const parsed = parseStructured('{"score": 3, "why": ');
    expect(parsed.kind).toBe("text");
    expect(parsed.note).toMatch(/did not parse/);
  });
});

describe("parseStructured — XML", () => {
  it("parses sibling top-level elements", () => {
    const parsed = parseStructured(
      "<quotes>\n</quotes>\n<final_reasoning>Fine.</final_reasoning>\n<final_score>3</final_score>"
    );
    expect(parsed.kind).toBe("xml");
    expect(parsed.note).toBeUndefined();
    expect(parsed).toMatchObject({
      nodes: [
        { type: "element", name: "quotes", children: [] },
        {
          type: "element",
          name: "final_reasoning",
          children: [{ type: "text", text: "Fine." }],
        },
        {
          type: "element",
          name: "final_score",
          children: [{ type: "text", text: "3" }],
        },
      ],
    });
  });

  it("repairs unclosed and stray tags", () => {
    const parsed = parseXml("<a><b>x</a></c>");
    expect(parsed?.repairs).toBe(2);
    expect(parsed?.nodes).toMatchObject([
      {
        name: "a",
        children: [{ name: "b", children: [{ type: "text", text: "x" }] }],
      },
    ]);
  });

  it("reads attributes and decodes entities", () => {
    expect(parseXml("<q id=\"1\" kind='x'>a &lt; b</q>")?.nodes).toEqual([
      {
        type: "element",
        name: "q",
        attrs: [
          ["id", "1"],
          ["kind", "x"],
        ],
        children: [{ type: "text", text: "a < b" }],
      },
    ]);
  });

  it("leaves prose with no closing tag alone", () => {
    expect(parseStructured("x < y and y > z").kind).toBe("text");
  });
});
