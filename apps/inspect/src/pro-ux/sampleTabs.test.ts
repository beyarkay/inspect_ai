import { describe, expect, it } from "vitest";

import { proSampleTab } from "./sampleTabs";

const both = { usage: true, metadata: true };

describe("proSampleTab", () => {
  it("gives each tab one name that means one thing", () => {
    expect(proSampleTab("messages", "Messages", both).title).toBe(
      "Conversation"
    );
    expect(proSampleTab("info", "Info", both).title).toBe("Usage & metadata");
    expect(proSampleTab("json", "JSON", both).hint).toContain("raw JSON");
  });

  it("names the Info tab after what it holds", () => {
    expect(
      proSampleTab("info", "Info", { usage: false, metadata: true })
    ).toEqual({
      title: "Metadata",
      hint: "This sample's metadata and store.",
    });
    expect(
      proSampleTab("info", "Info", { usage: true, metadata: false }).title
    ).toBe("Usage");
    expect(
      proSampleTab("info", "Info", { usage: true, metadata: true }).hint
    ).toBe(
      "Token usage per model, with working and total time, then this sample's metadata and store."
    );
  });

  it("keeps upstream's title for a tab it does not know", () => {
    expect(proSampleTab("new-tab", "New", both)).toEqual({ title: "New" });
  });
});
