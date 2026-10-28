import { describe, expect, it } from "vitest";

import { pickMatch, snippetFrom } from "./grepJump";

describe("snippetFrom", () => {
  it("splits a result line at its bold match", () => {
    expect(
      snippetFrom([
        { text: ']: ... "Action": [ "', strong: false },
        { text: "ec2", strong: true },
        { text: ':CreateNatGateway", "', strong: false },
        { text: "ec2", strong: true },
        { text: ":D...", strong: false },
      ])
    ).toEqual({
      before: ']: ... "Action": [ "',
      match: "ec2",
      after: ':CreateNatGateway", "ec2:D...',
    });
  });

  it("has no match when nothing is bold", () => {
    expect(snippetFrom([{ text: "plain", strong: false }]).match).toBe("");
  });
});

describe("pickMatch", () => {
  const rendered = [
    { before: '"Action": [\n  "', after: ':AttachInternetGateway",' },
    { before: 'Gateway",\n  "', after: ':CreateInternetGateway",' },
    { before: 'Gateway",\n  "', after: ':CreateNatGateway",' },
  ];

  it("picks the match whose surroundings agree with the line", () => {
    const line = {
      before: '...InternetGateway", "',
      match: "ec2",
      after: ':CreateNatGateway", "ec2:D...',
    };
    expect(pickMatch(line, rendered, 0)).toBe(2);
  });

  it("ignores quoting and whitespace differences", () => {
    const line = {
      before: '... \\"Action\\": [ \\"',
      match: "ec2",
      after: ':AttachInternetGateway\\", ...',
    };
    expect(pickMatch(line, rendered, 2)).toBe(0);
  });

  it("breaks ties by the line's place among the event's results", () => {
    const same = [
      { before: "x ", after: " y" },
      { before: "x ", after: " y" },
      { before: "x ", after: " y" },
    ];
    const line = { before: "x ", match: "m", after: " y" };
    expect(pickMatch(line, same, 1)).toBe(1);
    expect(pickMatch(line, same, 5)).toBe(2);
  });

  it("returns -1 without candidates", () => {
    expect(pickMatch({ before: "", match: "m", after: "" }, [], 0)).toBe(-1);
  });
});
