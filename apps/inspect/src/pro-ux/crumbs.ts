export interface CrumbEntry {
  name: string;
  /** Relative to the log dir, decoded. */
  path: string;
  kind: "folder" | "log";
  /** Logs at or below this entry. */
  logs: number;
}

const byName = (a: CrumbEntry, b: CrumbEntry): number =>
  a.name.localeCompare(b.name);

/** The folders and logs directly inside `dir` ("" for the log dir itself),
 *  from every log's path relative to the log dir. Folders first, A–Z; then
 *  logs newest first, since log names start with their timestamp. */
export const childEntries = (paths: string[], dir: string): CrumbEntry[] => {
  const prefix = dir ? `${dir.replace(/\/+$/, "")}/` : "";
  const folders = new Map<string, CrumbEntry>();
  const logs: CrumbEntry[] = [];
  for (const path of paths) {
    if (!path.startsWith(prefix)) continue;
    const rest = path.slice(prefix.length);
    if (!rest) continue;
    const slash = rest.indexOf("/");
    if (slash < 0) {
      logs.push({ name: rest, path, kind: "log", logs: 1 });
      continue;
    }
    const name = rest.slice(0, slash);
    const folder = folders.get(name) ?? {
      name,
      path: prefix + name,
      kind: "folder" as const,
      logs: 0,
    };
    folder.logs += 1;
    folders.set(name, folder);
  }
  return [
    ...[...folders.values()].sort(byName),
    ...logs.sort((a, b) => byName(b, a)),
  ];
};

/** `/Users/me/x` and `/home/me/x` as `~/x`. */
export const tildePath = (path: string): string =>
  path.replace(/^\/(Users|home)\/[^/]+(?=\/|$)/, "~");

export const isLogPath = (path: string): boolean =>
  /\.(eval|json)$/i.test(path);

/** Relative path of breadcrumb `index`, where segment 0 is the log dir's
 *  parent (outside the listing, so undefined), segment 1 the log dir ("")
 *  and the rest the parts of `currentPath`. */
export const crumbPath = (
  parts: string[],
  index: number
): string | undefined =>
  index < 1 ? undefined : parts.slice(0, index - 1).join("/");

export interface LogFacts {
  task?: string | null;
  model?: string;
  status?: string;
  samples?: number;
  metric?: { name: string; value: number };
  started?: string;
}

const formatMetric = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toPrecision(3);

/** Muted facts about a log, leaving out those the page already shows. */
export const logFacts = (
  facts: LogFacts,
  omit: ReadonlySet<keyof LogFacts> = new Set(),
  formatDate: (iso: string) => string = (iso) => iso
): string[] => {
  const parts: string[] = [];
  const keep = (key: keyof LogFacts) => !omit.has(key);
  if (keep("task") && facts.task) parts.push(facts.task);
  if (keep("model") && facts.model) parts.push(facts.model);
  if (keep("status") && facts.status) parts.push(facts.status);
  if (keep("samples") && facts.samples !== undefined)
    parts.push(`${facts.samples} sample${facts.samples === 1 ? "" : "s"}`);
  if (keep("metric") && facts.metric)
    parts.push(`${facts.metric.name} ${formatMetric(facts.metric.value)}`);
  if (keep("started") && facts.started) parts.push(formatDate(facts.started));
  return parts;
};
