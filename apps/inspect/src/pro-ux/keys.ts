import {
  allVisible,
  controlByText,
  firstVisible,
  isEditable,
  onDomSettled,
  overlayOpen,
} from "./dom";
import { toast } from "./toast";

export interface Binding {
  keys: string[];
  label: string;
  group: "Anywhere" | "Lists" | "Logs and samples" | "Transcript";
  /** The control this key acts on; the key is printed on it. */
  find?: () => HTMLElement | null;
  /** Custom action; return false to let the key fall through. */
  run?: (e: KeyboardEvent) => boolean;
  /** Owned by upstream; listed in help only. */
  upstream?: boolean;
}

const grid = (): HTMLElement | null => firstVisible<HTMLElement>("[role=grid]");

const sendToGrid = (key: string): boolean => {
  const target = grid();
  if (!target) return false;
  target.focus({ preventScroll: true });
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
  );
  return true;
};

const click = (target: HTMLElement | null): boolean => {
  if (!target) return false;
  target.click();
  return true;
};

const primaryTabs = (): HTMLElement[] => {
  const list = firstVisible<HTMLElement>("[role=tablist]");
  return list ? allVisible<HTMLElement>("[role=tab]", list) : [];
};

const filterInput = (): HTMLInputElement | null =>
  firstVisible<HTMLInputElement>(
    ".tab-tools input[type=text], .tab-tools input:not([type]), input[type=search], input[placeholder*='ilter'], input[placeholder*='earch']"
  );

const byLabel = (prefix: string): HTMLElement | null =>
  firstVisible<HTMLElement>(
    `[aria-label^="${prefix}"]:not([aria-disabled=true])`
  );

interface Actions {
  toggleHelp: () => void;
  closeHelp: () => boolean;
  toggleSkin: () => void;
}

let actions: Actions = {
  toggleHelp: () => undefined,
  closeHelp: () => false,
  toggleSkin: () => undefined,
};

export const setKeyActions = (next: Actions): void => {
  actions = next;
};

export const bindings: Binding[] = [
  {
    keys: ["?"],
    label: "show or hide these shortcuts",
    group: "Anywhere",
    run: () => {
      actions.toggleHelp();
      return true;
    },
  },
  {
    keys: ["/"],
    label: "focus the filter or search field",
    group: "Anywhere",
    run: () => {
      const input = filterInput();
      if (!input) return false;
      input.focus();
      input.select();
      return true;
    },
  },
  {
    keys: ["Esc"],
    label: "leave a field, else go up one level",
    group: "Anywhere",
    run: () => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && isEditable(active)) {
        active.blur();
        return true;
      }
      if (actions.closeHelp()) return true;
      if (overlayOpen()) return false;
      return click(byLabel("Back") ?? byLabel("back"));
    },
  },
  {
    keys: ["H"],
    label: "home: the list of logs",
    group: "Anywhere",
    find: () => byLabel("Home") ?? byLabel("home"),
  },
  {
    keys: ["T"],
    label: "switch between this look and upstream Inspect",
    group: "Anywhere",
    run: () => {
      actions.toggleSkin();
      return true;
    },
  },
  {
    keys: ["j", "↓"],
    label: "next row",
    group: "Lists",
    run: () => sendToGrid("ArrowDown"),
  },
  {
    keys: ["k", "↑"],
    label: "previous row",
    group: "Lists",
    run: () => sendToGrid("ArrowUp"),
  },
  {
    keys: ["o"],
    label: "open the selected row",
    group: "Lists",
    run: () => sendToGrid("Enter"),
  },
  {
    keys: ["1–9"],
    label: "switch to the nth tab",
    group: "Logs and samples",
  },
  {
    keys: ["[", "←"],
    label: "previous sample",
    group: "Logs and samples",
    find: () => byLabel("Previous"),
  },
  {
    keys: ["]", "→"],
    label: "next sample",
    group: "Logs and samples",
    find: () => byLabel("Next"),
  },
  {
    keys: ["r"],
    label: "raw or rendered text",
    group: "Logs and samples",
    find: () => controlByText("Raw") ?? controlByText("Rendered"),
  },
  {
    keys: ["s"],
    label: "search panel",
    group: "Logs and samples",
    find: () => controlByText("Search"),
  },
  {
    keys: ["y"],
    label: "copy menu",
    group: "Logs and samples",
    find: () => controlByText("Copy"),
  },
  {
    keys: ["d"],
    label: "download menu",
    group: "Logs and samples",
    find: () => controlByText("Download"),
  },
  {
    keys: ["c"],
    label: "collapse or expand all events",
    group: "Transcript",
    find: () => controlByText("Collapse") ?? controlByText("Expand"),
  },
  {
    keys: ["e"],
    label: "choose which events show",
    group: "Transcript",
    find: () =>
      allVisible<HTMLElement>("button, .btn").find((b) =>
        b.textContent.trim().startsWith("Events")
      ) ?? null,
  },
  {
    keys: ["j", "k"],
    label: "next or previous turn",
    group: "Transcript",
    upstream: true,
  },
  {
    keys: ["h", "l"],
    label: "previous or next agent",
    group: "Transcript",
    upstream: true,
  },
  {
    keys: ["f"],
    label: "focus the current turn",
    group: "Transcript",
    upstream: true,
  },
  {
    keys: ["gg", "G"],
    label: "first or last turn",
    group: "Transcript",
    upstream: true,
  },
  { keys: ["⌘F"], label: "find in page", group: "Transcript", upstream: true },
];

const lookup = (key: string): Binding | undefined => {
  const name = key === "Escape" ? "Esc" : key;
  return bindings.find((b) => !b.upstream && b.keys.includes(name));
};

const onKeyDown = (e: KeyboardEvent): void => {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
  const editing = isEditable(document.activeElement);
  if (editing && e.key !== "Escape") return;

  if (/^[1-9]$/.test(e.key) && !overlayOpen()) {
    const tab = primaryTabs()[Number(e.key) - 1];
    if (tab) {
      e.preventDefault();
      tab.click();
    }
    return;
  }

  const binding = lookup(e.key);
  if (!binding) return;
  if (binding.run && !binding.run(e)) return;
  if (!binding.run && !click(binding.find?.() ?? null)) return;
  e.preventDefault();
};

const printKeys = (): void => {
  const want = new Map<HTMLElement, string>();
  primaryTabs()
    .slice(0, 9)
    .forEach((tab, i) => want.set(tab, String(i + 1)));
  for (const b of bindings) {
    const target = b.upstream ? null : b.find?.();
    if (target) want.set(target, b.keys[0] ?? "");
  }
  for (const node of Array.from(
    document.querySelectorAll<HTMLElement>("[data-pro-key]")
  )) {
    if (!want.has(node)) node.removeAttribute("data-pro-key");
  }
  for (const [node, key] of want) {
    if (node.getAttribute("data-pro-key") !== key)
      node.setAttribute("data-pro-key", key);
  }
};

export const installKeys = (): void => {
  window.addEventListener("keydown", onKeyDown);
  printKeys();
  onDomSettled(printKeys);
};

export const announceSkin = (enabled: boolean): void =>
  toast(
    enabled ? "pro-UX look · T for upstream" : "upstream look · T for pro-UX"
  );
