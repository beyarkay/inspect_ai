import {
  MouseEvent,
  ReactElement,
  ReactNode,
  useState,
  useSyncExternalStore,
} from "react";

import {
  ExpandGroup,
  ExpandGroupContext,
  type GroupLevel,
} from "@tsmono/react/components";

import { useHtmlFlag } from "./useHtmlFlag";

export type CaretAction = "open" | "showAll" | "fold" | "unfold";

/** A plain click on a card's caret steps › → ⌄ → ⌄⌄ → ›: open with long
 *  panels cut short, then every line, then folded. A shift- or alt-click, like
 *  a click on the rest of the header, only folds or unfolds, keeping what was
 *  shown. A card with nothing cut short just folds and unfolds. */
export const caretAction = (
  collapsed: boolean,
  level: GroupLevel,
  foldOnly: boolean
): CaretAction => {
  if (foldOnly) return collapsed ? "unfold" : "fold";
  if (collapsed) return "open";
  return level === "truncated" ? "showAll" : "fold";
};

const DoubleChevron = () => (
  <svg
    aria-hidden="true"
    className="pro-caret-full"
    width="1em"
    height="1em"
    viewBox="0 0 16 16"
    fill="currentColor"
  >
    <path
      fillRule="evenodd"
      d="M1.646 6.646a.5.5 0 0 1 .708 0L8 12.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708"
    />
    <path
      fillRule="evenodd"
      d="M1.646 2.646a.5.5 0 0 1 .708 0L8 8.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708"
    />
  </svg>
);

interface CardExpandOptions {
  /** The card has a header caret. */
  enabled: boolean;
  collapsed: boolean;
  /** Fold or unfold the card, as a click on its header does. */
  toggle: () => void;
  /** Keeps a header stuck to the top in place when the card folds. */
  beforeFold: () => void;
  title?: string;
}

export interface CardExpand {
  /** Wraps the card so its expandable panels report to the caret. */
  wrap: (card: ReactElement) => ReactElement;
  /** Present only while the pro-UX skin is on. */
  caret?: {
    onClick: (e: MouseEvent) => void;
    /** Replaces the single chevron while every line shows. */
    icon?: ReactNode;
    hint: string;
    label?: string;
  };
}

const kNoSubscribe = () => () => {};

export const useCardExpand = ({
  enabled,
  collapsed,
  toggle,
  beforeFold,
  title,
}: CardExpandOptions): CardExpand => {
  const pro = useHtmlFlag("data-pro-ux");
  const [group] = useState(() => new ExpandGroup());
  const active = pro && enabled;
  const level = useSyncExternalStore(
    active ? group.subscribe : kNoSubscribe,
    group.getLevel,
    group.getLevel
  );
  const provided = active ? group : null;
  const wrap = (card: ReactElement) => (
    <ExpandGroupContext.Provider value={provided}>
      {card}
    </ExpandGroupContext.Provider>
  );
  if (!active) return { wrap };

  const onClick = (e: MouseEvent) => {
    switch (caretAction(collapsed, level, e.shiftKey || e.altKey)) {
      case "open":
        group.resetAll();
        toggle();
        break;
      case "showAll":
        group.showAll();
        break;
      case "fold":
        beforeFold();
        toggle();
        break;
      case "unfold":
        toggle();
        break;
    }
  };
  const full = !collapsed && level === "full";
  const cut = !collapsed && level === "truncated";
  return {
    wrap,
    caret: {
      onClick,
      icon: full ? <DoubleChevron /> : undefined,
      hint: collapsed
        ? "Open"
        : cut
          ? "Show every line · ⇧-click folds"
          : "Fold",
      label: cut && title ? `Show every line of ${title}` : undefined,
    },
  };
};
