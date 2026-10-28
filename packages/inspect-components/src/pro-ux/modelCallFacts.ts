import type { ModelEvent } from "@tsmono/inspect-common/types";
import { formatCurrency, formatNumber, formatTime } from "@tsmono/util";

export interface Fact {
  label: string;
  value: string;
}

export interface ProviderId {
  label: string;
  id: string;
  status?: number;
}

export interface CallFacts {
  /** Token usage, stop reason and timing, then the generation settings. */
  facts: Fact[];
  providerIds: ProviderId[];
}

const kSettingsFirst = [
  "temperature",
  "max_tokens",
  "reasoning_effort",
  "reasoning_tokens",
  "top_p",
  "top_k",
];

const rank = (key: string): number => {
  const i = kSettingsFirst.indexOf(key);
  return i === -1 ? kSettingsFirst.length : i;
};

const settingValue = (value: unknown): string =>
  typeof value === "number"
    ? formatNumber(value)
    : typeof value === "string"
      ? value
      : JSON.stringify(value);

const clock = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      });
};

/** Everything upstream's model-call Info tab shows, as label and value pairs
 *  short enough to sit on one line under the call. */
export const callFacts = (event: ModelEvent): CallFacts => {
  const facts: Fact[] = [];
  const usage = event.output.usage;
  if (usage) {
    const tokens: [string, number | null | undefined][] = [
      ["input", usage.input_tokens],
      ["cache read", usage.input_tokens_cache_read],
      ["cache write", usage.input_tokens_cache_write],
      ["output", usage.output_tokens],
      ["reasoning", usage.reasoning_tokens],
    ];
    const nonZero = tokens.filter(([, n]) => !!n);
    if (nonZero.length === 0) facts.push({ label: "tokens", value: "0" });
    for (const [label, n] of nonZero) {
      facts.push({ label, value: formatNumber(n ?? 0) });
    }
    if (usage.total_cost != null) {
      facts.push({ label: "cost", value: formatCurrency(usage.total_cost) });
    }
  }

  const choice = event.output.choices[0];
  if (choice && (choice.stop_reason !== "stop" || choice.stop_details)) {
    facts.push({ label: "stop reason", value: choice.stop_reason });
  }
  for (const [key, value] of Object.entries(choice?.stop_details ?? {})) {
    if (key !== "categories" && typeof value === "string" && value !== "") {
      facts.push({ label: key.replaceAll("_", " "), value });
    }
  }

  if (event.working_time != null) {
    facts.push({
      label: "working time",
      value: formatTime(event.working_time),
    });
  }
  if (event.timestamp) {
    facts.push({
      label: "window",
      value: `${clock(event.timestamp)} → ${event.completed ? clock(event.completed) : "—"}`,
    });
  }

  const settings = Object.entries(event.config as Record<string, unknown>)
    .filter(([key, value]) => key !== "max_connections" && value != null)
    .sort(([a], [b]) => rank(a) - rank(b));
  for (const [key, value] of settings) {
    facts.push({ label: key.replaceAll("_", " "), value: settingValue(value) });
  }

  const providerIds: ProviderId[] = [];
  if (event.output.response_id) {
    providerIds.push({ label: "response", id: event.output.response_id });
  }
  for (const request of event.request_ids ?? []) {
    providerIds.push({
      label: request.header,
      id: request.id,
      status: request.status,
    });
  }
  return { facts, providerIds };
};
