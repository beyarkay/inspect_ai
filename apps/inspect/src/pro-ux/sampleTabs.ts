import { useHtmlFlag } from "@tsmono/inspect-components/pro-ux";

import {
  kSampleActivityTabId,
  kSampleErrorTabId,
  kSampleInfoTabId,
  kSampleJsonTabId,
  kSampleMessagesTabId,
  kSampleRetriesTabId,
  kSampleScoringTabId,
  kSampleTerminalsTabId,
  kSampleTranscriptTabId,
} from "../constants";

export interface SampleTabContents {
  usage: boolean;
  metadata: boolean;
}

export interface SampleTabTitle {
  title: string;
  hint?: string;
}

const kTabs: Record<string, SampleTabTitle> = {
  [kSampleTranscriptTabId]: {
    title: "Transcript",
    hint: "Every event in the order it happened: model calls, tool calls, scoring and more, with timings.",
  },
  [kSampleMessagesTabId]: {
    title: "Conversation",
    hint: "The sample's final conversation, message by message, without the events in between. Each model call in the Transcript lists its own input under Full input.",
  },
  [kSampleTerminalsTabId]: {
    title: "Terminals",
    hint: "The sandbox's terminal sessions, played back.",
  },
  [kSampleScoringTabId]: {
    title: "Scoring",
    hint: "Each scorer's score for this sample, with the answer it scored and its explanation.",
  },
  [kSampleActivityTabId]: {
    title: "Activity",
    hint: "Charts of model and tool activity, context size and token use over time, then the notable events: errors, limits, scores.",
  },
  [kSampleErrorTabId]: {
    title: "Error",
    hint: "The error that ended this sample, with its traceback.",
  },
  [kSampleRetriesTabId]: {
    title: "Retries",
    hint: "Errors from earlier attempts at this sample, which were retried.",
  },
  [kSampleJsonTabId]: {
    title: "JSON",
    hint: "The whole sample record as raw JSON.",
  },
};

/** Upstream's "Info" tab holds token usage and the sample's metadata; name
 *  it after whichever of the two it has. */
const infoTab = ({ usage, metadata }: SampleTabContents): SampleTabTitle => {
  const title =
    usage && metadata ? "Usage & metadata" : usage ? "Usage" : "Metadata";
  const parts = [
    usage && "token usage per model, with working and total time",
    metadata && "this sample's metadata and store",
  ].filter(Boolean);
  const hint =
    parts.length > 0
      ? `${parts.join(", then ")}.`.replace(/^./, (c) => c.toUpperCase())
      : "Token usage and metadata: this sample has neither.";
  return { title, hint };
};

export const proSampleTab = (
  id: string,
  upstream: string,
  contents: SampleTabContents
): SampleTabTitle =>
  id === kSampleInfoTabId
    ? infoTab(contents)
    : (kTabs[id] ?? { title: upstream });

/** A sample tab's title and hint: self-explaining names under the pro-UX
 *  skin, upstream's title otherwise. */
export const useSampleTabTitle = (
  contents: SampleTabContents
): ((id: string, upstream: string) => SampleTabTitle) => {
  const on = useHtmlFlag("data-pro-ux");
  return (id, upstream) =>
    on ? proSampleTab(id, upstream, contents) : { title: upstream };
};
