import { createContext, RefObject, useState } from "react";

import { useLatestRef, useMirrorToStore, useUnmount } from "../hooks";

/** One expandable panel inside a card: nothing hidden, cut short, or cut
 *  short but shown in full. */
export type MemberState = "short" | "truncated" | "full";

/** The card's panels taken together: none worth cutting short, at least one
 *  cut short, or every cut-short panel shown in full. */
export type GroupLevel = "none" | "truncated" | "full";

export const groupLevel = (states: Iterable<MemberState>): GroupLevel => {
  let level: GroupLevel = "none";
  for (const state of states) {
    if (state === "truncated") return "truncated";
    if (state === "full") level = "full";
  }
  return level;
};

export const memberState = (
  worthCollapsing: boolean,
  collapsed: boolean
): MemberState => {
  if (!worthCollapsing) return "short";
  return collapsed ? "truncated" : "full";
};

export interface MemberActions {
  /** Show every line. */
  show: () => void;
  /** Back to the panel's default, cut short when long. */
  reset: () => void;
}

interface Member {
  state: MemberState;
  actions: RefObject<MemberActions>;
}

/** The expandable panels inside one card, so the card's header caret can
 *  show and set how much of them is visible. */
export class ExpandGroup {
  private members = new Map<object, Member>();
  private listeners = new Set<() => void>();
  private level: GroupLevel = "none";

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getLevel = (): GroupLevel => this.level;

  set(key: object, member: Member | undefined): void {
    if (member) this.members.set(key, member);
    else this.members.delete(key);
    const next = groupLevel([...this.members.values()].map((m) => m.state));
    if (next === this.level) return;
    this.level = next;
    for (const listener of this.listeners) listener();
  }

  showAll(): void {
    for (const member of this.members.values()) {
      if (member.state === "truncated") member.actions.current.show();
    }
  }

  resetAll(): void {
    for (const member of this.members.values()) member.actions.current.reset();
  }
}

export const ExpandGroupContext = createContext<ExpandGroup | null>(null);

/** Report a panel's state to the card it sits in. `undefined` while it has
 *  not been measured. */
export const useExpandGroupMember = (
  group: ExpandGroup | null,
  state: MemberState | undefined,
  actions: MemberActions
): void => {
  const [key] = useState(() => ({}));
  const actionsRef = useLatestRef(actions);
  useMirrorToStore(group ? state : undefined, (value) =>
    group?.set(key, { state: value, actions: actionsRef })
  );
  useUnmount(() => group?.set(key, undefined));
};
