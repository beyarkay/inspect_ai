export interface Column {
  index: string;
  label: string;
  /** Column id from the header's "Filter <id>" control, when present. */
  id: string;
  header: HTMLElement;
}

export const columnsOf = (grid: HTMLElement): Map<string, Column> => {
  const columns = new Map<string, Column>();
  for (const header of Array.from(
    grid.querySelectorAll<HTMLElement>("[role=columnheader]")
  )) {
    const index = header.getAttribute("aria-colindex");
    if (!index) continue;
    const filter = header.querySelector("[aria-label^='Filter ']");
    columns.set(index, {
      index,
      label: header.textContent.trim(),
      id: filter?.getAttribute("aria-label")?.slice("Filter ".length) ?? "",
      header,
    });
  }
  return columns;
};

export const bodyRows = (grid: HTMLElement): HTMLElement[] =>
  Array.from(grid.querySelectorAll<HTMLElement>("[role=row]")).filter(
    (row) => row.querySelector("[role=gridcell]") !== null
  );

export const cellsOf = (row: HTMLElement): HTMLElement[] =>
  Array.from(row.querySelectorAll<HTMLElement>("[role=gridcell]"));

const kIconMeaning: [string, string][] = [
  ["check", "complete"],
  ["exclamation", "error"],
  ["x-circle", "cancelled"],
  ["hourglass", "running"],
  ["play", "running"],
  ["stop", "cancelled"],
];

/** Visible text of a cell, or the meaning of its status icon. */
export const cellText = (cell: HTMLElement): string => {
  const text = cell.textContent.trim();
  if (text) return text;
  const titled = cell.querySelector("[title], [aria-label]");
  const label =
    titled?.getAttribute("title") ?? titled?.getAttribute("aria-label");
  if (label) return label;
  const icon = cell.querySelector("i[class*='bi-'], [class*='codicon-']");
  const cls = icon?.className ?? "";
  if (typeof cls === "string") {
    for (const [needle, meaning] of kIconMeaning) {
      if (cls.includes(needle)) return meaning;
    }
  }
  return "";
};

/** "1 min 9 sec" / "3.5 sec" / "2 hr 4 min" → seconds. */
export const parseDuration = (text: string): number | null => {
  const units: Record<string, number> = {
    ms: 0.001,
    sec: 1,
    secs: 1,
    s: 1,
    min: 60,
    mins: 60,
    m: 60,
    hr: 3600,
    hrs: 3600,
    h: 3600,
    day: 86400,
    days: 86400,
    d: 86400,
  };
  let total = 0;
  let matched = false;
  for (const m of text.matchAll(
    /([\d.]+)\s*(ms|secs?|s|mins?|m|hrs?|h|days?|d)\b/g
  )) {
    total += Number(m[1]) * (units[m[2] ?? ""] ?? 1);
    matched = true;
  }
  return matched ? total : null;
};

export const parseNumber = (text: string): number | null => {
  const cleaned = text.replace(/[,\s]/g, "");
  if (!/^-?\d+(\.\d+)?(e-?\d+)?$/i.test(cleaned)) return null;
  return Number(cleaned);
};
