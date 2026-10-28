import { el } from "./dom";
import { cellsOf, cellText, columnsOf } from "./grid";

const kIdentityColumns = ["task", "id", "name", "sample", "file"];

// The home log list already shows every field in full; a card adds nothing.
const kNoCardGrids = new Set(["Evaluation logs"]);

let card: HTMLDivElement | null = null;
let currentRow: HTMLElement | null = null;

const ensureCard = (): HTMLDivElement => {
  if (!card) {
    card = el("div", { class: "pro-tip", "aria-hidden": "true" });
    document.body.appendChild(card);
  }
  return card;
};

const hide = (): void => {
  currentRow = null;
  if (card) card.style.display = "none";
};

const render = (row: HTMLElement, grid: HTMLElement): void => {
  const columns = columnsOf(grid);
  const pairs: { label: string; value: string }[] = [];
  for (const cell of cellsOf(row)) {
    const column = columns.get(cell.getAttribute("aria-colindex") ?? "");
    const value = cellText(cell);
    if (!value || value === "-") continue;
    pairs.push({ label: column?.label || "status", value });
  }
  const heading =
    pairs.find((p) => kIdentityColumns.includes(p.label.toLowerCase())) ??
    pairs.find((p) => p.label !== "status");

  const node = ensureCard();
  node.replaceChildren();
  const info = el("div", { class: "pro-tip-info" });
  info.append(el("div", { class: "pro-tip-head" }, heading?.value ?? "row"));
  const subtitle = grid.getAttribute("aria-label");
  if (subtitle) info.append(el("div", { class: "pro-tip-sub" }, subtitle));
  const table = el("table");
  for (const pair of pairs) {
    if (pair === heading) continue;
    const tr = el("tr");
    if (pair.value.length > 40) {
      const td = el("td", { colspan: "2", class: "pro-tip-long" });
      td.append(el("div", {}, pair.label), el("div", {}, pair.value));
      tr.append(td);
    } else {
      tr.append(el("td", {}, pair.label), el("td", {}, pair.value));
    }
    table.append(tr);
  }
  info.append(table);
  info.append(
    el(
      "div",
      { class: "pro-tip-note" },
      "click to open · j/k move the selection, o opens it"
    )
  );
  node.append(info);
  node.style.display = "block";
};

const place = (x: number): void => {
  if (!card) return;
  const onRight = x > window.innerWidth / 2;
  card.style.left = onRight ? "16px" : "";
  card.style.right = onRight ? "" : "16px";
};

export const installTip = (enabled: () => boolean): void => {
  document.addEventListener(
    "mousemove",
    (e) => {
      if (!enabled()) {
        if (currentRow) hide();
        return;
      }
      const target = e.target instanceof Element ? e.target : null;
      const row = target?.closest<HTMLElement>("[role=row]") ?? null;
      const grid = row?.closest<HTMLElement>("[role=grid]") ?? null;
      if (
        !row ||
        !grid ||
        kNoCardGrids.has(grid.getAttribute("aria-label") ?? "") ||
        !row.querySelector("[role=gridcell]")
      ) {
        if (currentRow) hide();
        return;
      }
      if (row !== currentRow) {
        currentRow = row;
        render(row, grid);
      }
      place(e.clientX);
    },
    { passive: true }
  );
  document.addEventListener("mousedown", hide, { capture: true });
  document.addEventListener("keydown", hide, { capture: true });
  window.addEventListener("blur", hide);
  window.addEventListener("hashchange", hide);
};
