import {
  css,
  isDark,
  pageIsDark,
  prgn,
  sequential,
  sequentialRampCss,
} from "./colour";
import { allVisible, onDomSettled } from "./dom";
import {
  bodyRows,
  cellsOf,
  cellText,
  columnsOf,
  parseDuration,
  parseNumber,
  type Column,
} from "./grid";

type Kind = "score" | "quantity" | "duration";

const kindOf = (column: Column): Kind | null => {
  const label = column.label.toLowerCase();
  if (column.id.startsWith("score") || label === "score") return "score";
  if (label.includes("duration") || label === "time") return "duration";
  if (
    label.includes("tokens") ||
    label === "samples" ||
    label.includes("cost") ||
    label === "messages"
  )
    return "quantity";
  return null;
};

const kLetterScores: Record<string, number> = { C: 1, P: 0.5, I: 0, N: 0 };

/** Infer the scale's top from the values seen: 1, 10 or 100. */
export const scaleTop = (values: number[]): number | null => {
  if (values.length === 0 || values.some((v) => v < 0)) return null;
  const max = Math.max(...values);
  if (max <= 1) return 1;
  if (max <= 10) return 10;
  if (max <= 100) return 100;
  return null;
};

const target = (cell: HTMLElement): HTMLElement => {
  const child = cell.firstElementChild;
  return child instanceof HTMLElement ? child : cell;
};

const clear = (node: HTMLElement): void => {
  node.removeAttribute("data-pro-badge");
  node.removeAttribute("data-pro-of");
  node.removeAttribute("data-pro-q");
  node.style.removeProperty("--pro-badge-bg");
  node.style.removeProperty("--pro-badge-fg");
  node.style.removeProperty("--q");
};

const badge = (node: HTMLElement, t: number, of: string): void => {
  const rgb = prgn(t);
  node.setAttribute("data-pro-badge", "");
  node.setAttribute("data-pro-of", of);
  node.style.setProperty("--pro-badge-bg", css(rgb));
  node.style.setProperty("--pro-badge-fg", isDark(rgb) ? "#fff" : "#2a2a2e");
};

const decorateGrid = (grid: HTMLElement): void => {
  const columns = columnsOf(grid);
  const rows = bodyRows(grid);
  const byColumn = new Map<string, { node: HTMLElement; text: string }[]>();
  for (const row of rows) {
    for (const cell of cellsOf(row)) {
      const index = cell.getAttribute("aria-colindex") ?? "";
      const node = target(cell);
      clear(node);
      const list = byColumn.get(index) ?? [];
      list.push({ node, text: cellText(cell) });
      byColumn.set(index, list);
    }
  }

  for (const [index, column] of columns) {
    const kind = kindOf(column);
    column.header.toggleAttribute(
      "data-pro-ramp",
      kind === "quantity" || kind === "duration"
    );
    if (kind === "quantity" || kind === "duration") {
      column.header.style.setProperty(
        "--pro-ramp",
        sequentialRampCss(pageIsDark())
      );
    }
    const cells = byColumn.get(index) ?? [];
    if (!kind || cells.length === 0) continue;

    if (kind === "score") {
      const numeric = cells
        .map((c) => parseNumber(c.text))
        .filter((v): v is number => v !== null);
      const top = scaleTop(numeric);
      for (const c of cells) {
        const letter = kLetterScores[c.text];
        const value = parseNumber(c.text);
        if (letter !== undefined) badge(c.node, letter, "");
        else if (value !== null && top !== null)
          badge(c.node, value / top, top === 1 ? "" : `/${top}`);
      }
      continue;
    }

    const parse = kind === "duration" ? parseDuration : parseNumber;
    const values = cells.map((c) => parse(c.text));
    const positive = values.filter((v): v is number => v !== null && v > 0);
    if (positive.length < 2) continue;
    const lo = Math.log(Math.min(...positive));
    const hi = Math.log(Math.max(...positive));
    cells.forEach((c, i) => {
      const v = values[i];
      if (v === null || v === undefined || v <= 0) return;
      const t = hi > lo ? (Math.log(v) - lo) / (hi - lo) : 1;
      c.node.setAttribute("data-pro-q", "");
      c.node.style.setProperty("--q", css(sequential(t, pageIsDark())));
    });
  }
};

const decorateAll = (): void => {
  for (const grid of allVisible<HTMLElement>("[role=grid]")) decorateGrid(grid);
};

export const installCells = (): void => {
  decorateAll();
  onDomSettled(decorateAll);
  document.addEventListener(
    "scroll",
    () => requestAnimationFrame(decorateAll),
    {
      capture: true,
      passive: true,
    }
  );
  new MutationObserver(decorateAll).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-bs-theme"],
  });
};
