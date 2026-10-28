import { el } from "./dom";
import { bindings } from "./keys";

const kOpenKey = "pro-ux-help-open";

let panel: HTMLDivElement | null = null;

const build = (): HTMLDivElement => {
  const root = el("div", {
    class: "pro-help",
    role: "complementary",
    "aria-label": "Keyboard shortcuts",
  });
  const head = el("div", { class: "pro-help-head" });
  head.append(el("b", {}, "Keyboard shortcuts"), el("span", {}, "? to close"));
  root.append(head);
  const groups = [...new Set(bindings.map((b) => b.group))];
  for (const group of groups) {
    root.append(el("div", { class: "pro-help-group" }, group));
    const table = el("table");
    for (const b of bindings.filter((x) => x.group === group)) {
      const row = el("tr");
      const keyCell = el("td");
      b.keys.forEach((k, i) => {
        if (i > 0) keyCell.append(" ");
        keyCell.append(el("kbd", {}, k));
      });
      row.append(
        keyCell,
        el("td", {}, b.upstream ? `${b.label} (Inspect's own)` : b.label)
      );
      table.append(row);
    }
    root.append(table);
  }
  return root;
};

const setOpen = (open: boolean): void => {
  if (open && !panel) {
    panel = build();
    document.body.appendChild(panel);
  }
  if (panel) panel.style.display = open ? "block" : "none";
  try {
    localStorage.setItem(kOpenKey, open ? "1" : "0");
  } catch {
    // Storage unavailable: the panel just won't remember.
  }
};

export const toggleHelp = (): void =>
  setOpen(!panel || panel.style.display === "none");

export const closeHelp = (): boolean => {
  if (!panel || panel.style.display === "none") return false;
  setOpen(false);
  return true;
};

export const installHelp = (): void => {
  const button = el(
    "button",
    {
      class: "pro-help-button",
      "aria-label": "Keyboard shortcuts",
      "data-pro-hint": "Keyboard shortcuts (?)",
    },
    "?"
  );
  button.addEventListener("click", toggleHelp);
  document.body.appendChild(button);
  try {
    if (localStorage.getItem(kOpenKey) === "1") setOpen(true);
  } catch {
    // Storage unavailable: start closed.
  }
};
