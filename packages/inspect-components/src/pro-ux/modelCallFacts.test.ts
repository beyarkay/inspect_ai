import { describe, expect, it } from "vitest";

import type { ModelEvent } from "@tsmono/inspect-common/types";

import { callFacts } from "./modelCallFacts";

const base: ModelEvent = {
  event: "model",
  model: "m",
  input: [],
  tools: [],
  tool_choice: "auto",
  timestamp: "",
  working_start: 0,
  config: {},
  output: {
    model: "m",
    completion: "",
    choices: [
      {
        message: { role: "assistant", content: "hi" },
        stop_reason: "stop",
      },
    ],
  },
};

const event = (over: Partial<ModelEvent> = {}): ModelEvent => ({
  ...base,
  ...over,
});

const labels = (e: ModelEvent) => callFacts(e).facts.map((f) => f.label);

describe("callFacts", () => {
  it("lists non-zero token counts, then settings with the common ones first", () => {
    const facts = callFacts(
      event({
        working_time: 7,
        config: {
          max_retries: 1,
          max_connections: 10,
          temperature: 0.7,
          reasoning_effort: "low",
        },
        output: {
          model: "m",
          completion: "",
          choices: [
            {
              message: { role: "assistant", content: "" },
              stop_reason: "tool_calls",
            },
          ],
          usage: {
            input_tokens: 3,
            input_tokens_cache_write: 3424,
            input_tokens_cache_read: 0,
            output_tokens: 602,
            reasoning_tokens: 189,
            total_tokens: 4218,
          },
        },
      })
    ).facts;
    expect(facts.map((f) => `${f.label} ${f.value}`)).toEqual([
      "input 3",
      "cache write 3,424",
      "output 602",
      "reasoning 189",
      "stop reason tool_calls",
      "working time 7 sec",
      "temperature 0.7",
      "reasoning effort low",
      "max retries 1",
    ]);
  });

  it("says zero tokens once, and omits a plain stop", () => {
    expect(
      labels(
        event({
          output: {
            model: "m",
            completion: "",
            choices: [
              {
                message: { role: "assistant", content: "" },
                stop_reason: "stop",
              },
            ],
            usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
          },
        })
      )
    ).toEqual(["tokens"]);
  });

  it("keeps refusal details and provider ids", () => {
    const facts = callFacts(
      event({
        request_ids: [{ header: "x-request-id", id: "req_1", status: 200 }],
        output: {
          model: "m",
          completion: "",
          response_id: "resp_1",
          choices: [
            {
              message: { role: "assistant", content: "" },
              stop_reason: "content_filter",
              stop_details: {
                categories: [{ category: "cyber" }],
                category: "cyber",
                explanation: "no",
              },
            },
          ],
        },
      })
    );
    expect(facts.facts.map((f) => f.label)).toEqual([
      "stop reason",
      "category",
      "explanation",
    ]);
    expect(facts.providerIds.map((p) => p.id)).toEqual(["resp_1", "req_1"]);
  });
});
