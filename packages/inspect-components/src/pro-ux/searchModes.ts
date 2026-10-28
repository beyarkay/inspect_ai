import type { SearchType } from "../transcript-search/types";

const proUxOn = (): boolean =>
  typeof document !== "undefined" &&
  document.documentElement.hasAttribute("data-pro-ux");

/** Grep is free and instant, so pro-UX opens on it; upstream opens on the
 *  paid LLM search. */
export const defaultSearchType = (proUx = proUxOn()): SearchType =>
  proUx ? "grep" : "llm";

/** Search-mode segments, default first; pro-UX names grep after the tool. */
export const searchModeSegments = (
  proUx: boolean
): { id: SearchType; label: string }[] =>
  proUx
    ? [
        { id: "grep", label: "grep" },
        { id: "llm", label: "LLM" },
      ]
    : [
        { id: "llm", label: "LLM" },
        { id: "grep", label: "Grep" },
      ];
