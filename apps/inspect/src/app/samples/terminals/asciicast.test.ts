import { describe, expect, it } from "vitest";

import {
  castDuration,
  castGeometry,
  castHeader,
  castMarkers,
  highlightCommandEchoes,
  idleShortenedTime,
  storeCasts,
  terminalMarker,
} from "./asciicast";

describe("storeCasts", () => {
  it("collects asciinema-prefixed string entries, named by suffix", () => {
    const cast = '{"version": 2}\n[0.1, "o", "hi"]';
    expect(
      storeCasts({
        "asciinema:terminal-main": cast,
        "asciinema:terminal-server": cast,
        "tool:state": { pointer: "s3://..." },
        plain: "value",
      })
    ).toEqual([
      { key: "asciinema:terminal-main", name: "terminal-main", cast },
      { key: "asciinema:terminal-server", name: "terminal-server", cast },
    ]);
  });

  it("skips non-string values under the prefix", () => {
    expect(storeCasts({ "asciinema:odd": 42 })).toEqual([]);
  });
});

describe("castGeometry", () => {
  it("reads width/height from the header line", () => {
    const cast = '{"version": 2, "width": 160, "height": 40}\n[0.1, "o", "x"]';
    expect(castGeometry(cast)).toEqual({ rows: 40, cols: 160 });
  });

  it("falls back to 80x24 on an unparseable or bare header", () => {
    expect(castGeometry("not json\nmore")).toEqual({ rows: 24, cols: 80 });
    expect(castGeometry('{"version": 2}')).toEqual({ rows: 24, cols: 80 });
  });
});

describe("castHeader", () => {
  it("reads the start time and inspect_ranges session/agent fields", () => {
    const cast = JSON.stringify({
      version: 2,
      width: 160,
      height: 40,
      timestamp: 1792950894,
      ir_session: "tests",
      ir_agent_span_id: "span-1",
      ir_agent: "test-runner",
    });
    expect(castHeader(cast)).toEqual({
      rows: 40,
      cols: 160,
      timestamp: 1792950894,
      session: "tests",
      agentSpanId: "span-1",
      agentName: "test-runner",
    });
  });

  it("leaves out absent or mistyped fields", () => {
    expect(
      castHeader('{"version": 2, "timestamp": "soon", "ir_session": ""}')
    ).toEqual({ rows: 24, cols: 80 });
  });
});

describe("terminalMarker", () => {
  it("parses send, open and read markers", () => {
    expect(terminalMarker("send tests: 'npm test\\n'")).toEqual({
      action: "send",
      session: "tests",
      command: "npm test\n",
    });
    expect(terminalMarker("open server")).toEqual({
      action: "open",
      session: "server",
    });
    expect(terminalMarker("read build")).toEqual({
      action: "read",
      session: "build",
    });
  });

  it("is undefined for other labels", () => {
    expect(terminalMarker("send make")).toBeUndefined();
    expect(terminalMarker("clipped to the tail")).toBeUndefined();
  });
});

describe("castDuration", () => {
  it("reads the last event's time", () => {
    const cast = '{"version": 2}\n[0.1, "o", "a"]\n[12.5, "o", "b"]\n';
    expect(castDuration(cast)).toBe(12.5);
  });

  it("caps each gap at the idle time limit, as playback does", () => {
    const cast =
      '{"version": 2}\n[1, "o", "a"]\n[601, "o", "b"]\n[602.5, "o", "c"]';
    expect(castDuration(cast)).toBe(602.5);
    expect(castDuration(cast, 2)).toBe(1 + 2 + 1.5);
  });

  it("is 0 when the cast has no events", () => {
    expect(castDuration('{"version": 2}')).toBe(0);
    expect(castDuration("")).toBe(0);
  });
});

describe("idleShortenedTime", () => {
  const cast =
    '{"version": 2}\n[1, "o", "a"]\n[601, "o", "b"]\n[602.5, "o", "c"]';

  it("caps each gap before the time, and the time since the last event", () => {
    expect(idleShortenedTime(cast, 0.5, 2)).toBe(0.5);
    expect(idleShortenedTime(cast, 300, 2)).toBe(1 + 2);
    expect(idleShortenedTime(cast, 602, 2)).toBe(1 + 2 + 1);
    expect(idleShortenedTime(cast, 900, 2)).toBe(1 + 2 + 1.5 + 2);
  });
});

describe("castMarkers", () => {
  it("places a command marker just after the output that echoes it", () => {
    const cast =
      '{"version": 2}\n[1, "m", "send ls"]\n[1.5, "o", "$ ls"]\n[10, "m", "send pwd"]\n[10.2, "o", "$ pwd"]';
    const markers = castMarkers(cast, 2, 30);
    expect(markers.map(([, label]) => label)).toEqual(["send ls", "send pwd"]);
    // The 8.5s gap before "send pwd" plays as 2s, so its echo lands at 3.7.
    expect(markers[0]?.[0]).toBeCloseTo(1.51);
    expect(markers[1]?.[0]).toBeCloseTo(3.71);
  });

  it("notes long think time before a command on its label", () => {
    const cast =
      '{"version": 2}\n[1, "o", "a"]\n[601, "m", "send make"]\n[601.5, "o", "$ make"]';
    expect(castMarkers(cast, 2, 30)).toEqual([
      [3.51, "send make (after 10 min idle)"],
    ]);
  });

  it("adds no markers for idle gaps alone", () => {
    const cast =
      '{"version": 2}\n[1, "m", "send make"]\n[61, "o", "$ make"]\n[200, "o", "done"]';
    expect(castMarkers(cast, 2, 30)).toEqual([[3.01, "send make"]]);
  });

  it("keeps only send markers, labeled by command, when the cast has them", () => {
    const cast = [
      '{"version": 2}',
      JSON.stringify([0, "m", "open main"]),
      JSON.stringify([1, "m", "send main: 'npm test -- orders\\n'"]),
      JSON.stringify([1.5, "o", "$ npm test -- orders\r\n"]),
      JSON.stringify([2, "m", "read main"]),
      JSON.stringify([3, "m", "send main: \"cat > a <<'EOF'\\nx\\nEOF\\n\""]),
      JSON.stringify([3.5, "o", "cat > a <<'EOF'\r\n"]),
    ].join("\n");
    expect(castMarkers(cast, 2, 30).map(([, label]) => label)).toEqual([
      "npm test -- orders",
      "cat > a <<'EOF' …",
    ]);
  });

  it("keeps a command with no following output at its own time", () => {
    const cast = '{"version": 2}\n[1, "o", "a"]\n[2, "m", "send exit"]';
    expect(castMarkers(cast, 2, 30)).toEqual([[2, "send exit"]]);
  });
});

describe("highlightCommandEchoes", () => {
  const outputs = (cast: string): unknown[] =>
    cast
      .split("\n")
      .slice(1)
      .map((line): unknown => JSON.parse(line))
      .filter((event) => Array.isArray(event) && event[1] === "o")
      .map((event) =>
        Array.isArray(event) && typeof event[2] === "string"
          ? event[2]
          : undefined
      );

  it("styles the echoed command line, not the output after it", () => {
    const cast = [
      '{"version": 2}',
      JSON.stringify([1, "m", "send main: 'id\\n'"]),
      JSON.stringify([1.5, "o", "$ id\r\nuid=1000(agent)\r\n"]),
    ].join("\n");
    expect(outputs(highlightCommandEchoes(cast))).toEqual([
      "\x1b[1;38;2;130;170;255m$ id\x1b[22;39m\r\nuid=1000(agent)\r\n",
    ]);
  });

  it("styles continuation lines of a multi-line command", () => {
    const cast = [
      '{"version": 2}',
      JSON.stringify([1, "m", "send main: \"cat > a <<'EOF'\\nx\\nEOF\\n\""]),
      JSON.stringify([1.5, "o", "cat > a <<'EOF'\r\n> x\r\n> EOF\r\n$ "]),
    ].join("\n");
    expect(outputs(highlightCommandEchoes(cast))).toEqual([
      "\x1b[1;38;2;130;170;255mcat > a <<'EOF'\x1b[22;39m\r\n\x1b[1;38;2;130;170;255m> x\x1b[22;39m\r\n\x1b[1;38;2;130;170;255m> EOF\x1b[22;39m\r\n$ ",
    ]);
  });

  it("leaves a chunk that ends mid-escape alone", () => {
    const cast = [
      '{"version": 2}',
      JSON.stringify([1, "m", "send main: 'id\\n'"]),
      JSON.stringify([1.5, "o", "$ id\x1b[3"]),
    ].join("\n");
    expect(highlightCommandEchoes(cast)).toBe(cast);
  });

  it("leaves output alone when it doesn't echo the command", () => {
    const cast = [
      '{"version": 2}',
      JSON.stringify([1, "m", "send main: 'C-c'"]),
      JSON.stringify([1.5, "o", "^C\r\n$ "]),
      JSON.stringify([2, "m", "read main"]),
      JSON.stringify([2.5, "o", "more output"]),
    ].join("\n");
    expect(highlightCommandEchoes(cast)).toBe(cast);
  });
});
