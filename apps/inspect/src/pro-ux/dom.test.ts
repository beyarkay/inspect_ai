// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { isEditable } from "./dom";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("isEditable", () => {
  it("sees a textarea focused inside a shadow root", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const textarea = document.createElement("textarea");
    host.attachShadow({ mode: "open" }).append(textarea);
    textarea.focus();
    expect(document.activeElement).toBe(host);
    expect(isEditable(document.activeElement)).toBe(true);
  });

  it("is false for a focused button", () => {
    const button = document.createElement("button");
    document.body.append(button);
    button.focus();
    expect(isEditable(document.activeElement)).toBe(false);
  });

  it("is true for an input", () => {
    const input = document.createElement("input");
    document.body.append(input);
    expect(isEditable(input)).toBe(true);
  });
});
