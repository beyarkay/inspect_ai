import "./tasks.css";

import type {
  CellContext,
  HeaderContext,
  Row,
  SortingState,
} from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";
import { FC, MouseEvent, useMemo } from "react";

import { useHtmlFlag } from "@tsmono/inspect-components/pro-ux";
import { Icon } from "@tsmono/react/icons";

import { useLogDir } from "../app_config";
import type { LogListRow } from "../app/log-list/grid/columns/types";
import type {
  ValueAccessor,
  ValueComparator,
} from "../app/log-list/listing/types";
import { logSamplesUrl, type RoutePrefix } from "../app/routing/url";
import type { ExtendedColumnDef } from "../app/shared/data-grid/columnTypes";
import type { DataGridFeatures } from "../app/shared/data-grid/tableFeatures";
import { useSamplesListing, type SamplesListingRow } from "../log_data";

import { scaleTop } from "./cells";
import { css, isDark, prgn } from "./colour";
import { commonIdPrefix } from "./sampleLabels";
import {
  buildIndex,
  groupByScale,
  logKey,
  moveAfter,
  scaleGroup,
  scaleGroupLabel,
  shownSampleCount,
  shownScale,
  shownScore,
  tasksListingAccessors,
  type SampleIndex,
  type ScaleGroup,
} from "./tasksIndex";
import { openArgsRows, openSampleRows, useOpenRows } from "./tasksState";
import {
  argsDetail,
  argsSummary,
  badgeSlotCh,
  firstNumericScore,
  scoreLabel,
  statsHint,
  type ScoreStats,
} from "./taskStats";

type Column = ExtendedColumnDef<LogListRow>;
type CellCtx = CellContext<DataGridFeatures, LogListRow, unknown>;
type HeaderCtx = HeaderContext<DataGridFeatures, LogListRow, unknown>;
type GridRow = Row<DataGridFeatures, LogListRow>;

const kNoRows: SamplesListingRow[] = [];

const indexCache = new WeakMap<SamplesListingRow[], SampleIndex>();

/** Every sample summary under the log dir, grouped by log. One query shared
 *  by every cell: the details fetch that fills the Tokens column already
 *  stored them, so this is a local read. */
const useSampleIndex = (): SampleIndex => {
  const logDir = useLogDir();
  const rows = useSamplesListing({ logDir, scope: { prefix: logDir } }).data;
  const list = rows ?? kNoRows;
  let index = indexCache.get(list);
  if (!index) {
    index = buildIndex(list);
    indexCache.set(list, index);
  }
  return index;
};

const sampleUrl = (
  parentUrl: string | undefined,
  id: string | number,
  epoch: number
): string | undefined => {
  if (!parentUrl) return undefined;
  const prefix: RoutePrefix = parentUrl.startsWith("/tasks/")
    ? "/tasks"
    : "/logs";
  const logPath = parentUrl.slice(prefix.length + 1);
  return logSamplesUrl(logPath, id, epoch, undefined, prefix);
};

interface SampleRef {
  id: string;
  epoch: number;
  /** The parent log's score scale, so a sample badge reads like its log's. */
  top: number | null;
}

/** Sub-rows are ordinary grid rows; this marks which ones are samples. */
const sampleRefs = new WeakMap<LogListRow, SampleRef>();

export const sampleSubRows = (
  parent: LogListRow,
  samples: SamplesListingRow[],
  top: number | null
): LogListRow[] => {
  const prefix = commonIdPrefix(samples.map((s) => String(s.summary.id)));
  return [...samples]
    .sort(
      (a, b) =>
        String(a.summary.id).localeCompare(String(b.summary.id), undefined, {
          numeric: true,
        }) || a.summary.epoch - b.summary.epoch
    )
    .map((s) => {
      const { id, epoch } = s.summary;
      const score = firstNumericScore(s.derived.scores);
      const row: LogListRow = {
        id: `${parent.id}::${String(id)}::${epoch}`,
        name: parent.name,
        type: "file",
        url: sampleUrl(parent.url, id, epoch),
        task: String(id).slice(prefix.length),
        score: score ?? undefined,
        status: s.summary.error
          ? "error"
          : s.summary.completed === false
            ? "started"
            : "success",
        totalTokens: s.derived.tokens,
        duration: s.summary.total_time ?? undefined,
      };
      sampleRefs.set(row, { id: String(id), epoch, top });
      return row;
    });
};

/** Header rows that open each scale group; every other cell is blank. */
const groupHeads = new WeakMap<
  LogListRow,
  { group: ScaleGroup; count: number }
>();

const headRow = (group: ScaleGroup, count: number): LogListRow => {
  const row: LogListRow = {
    id: `pro-score-group:${String(group)}`,
    name: "",
    type: "file",
  };
  groupHeads.set(row, { group, count });
  return row;
};

/** Score-sorted rows split into one block per scale, each under a header,
 *  when more than one scale is present. */
export const withScaleGroups = (
  rows: LogListRow[],
  index: SampleIndex
): LogListRow[] => {
  const groups = groupByScale(rows, (row) => scaleGroup(row, index));
  if (groups.length < 2) return rows;
  return groups.flatMap((g) => [headRow(g.group, g.rows.length), ...g.rows]);
};

/** Tasks view only: scale groups while sorted by Score, and sample rows
 *  beneath each opened log row. */
export const useProSampleRows = (
  rows: LogListRow[],
  mode: string,
  sorting: SortingState
): LogListRow[] => {
  const pro = useHtmlFlag("data-pro-ux");
  const open = useOpenRows(openSampleRows);
  const index = useSampleIndex();
  const byScore = sorting[0]?.id === "score";
  return useMemo(() => {
    if (!pro || mode !== "tasks") return rows;
    const grouped = byScore ? withScaleGroups(rows, index) : rows;
    if (open.size === 0) return grouped;
    const out: LogListRow[] = [];
    for (const row of grouped) {
      out.push(row);
      const samples = open.has(row.id)
        ? index.byLog.get(logKey(row))
        : undefined;
      if (samples && samples.length > 1)
        out.push(
          ...sampleSubRows(
            row,
            samples,
            index.stats.get(logKey(row))?.top ?? null
          )
        );
    }
    return out;
  }, [pro, mode, open, index, byScore, rows]);
};

/** Keep a click inside a row from opening the row (rows are links). */
const own = (e: MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();
};

const isSubRow = (row: LogListRow): boolean => sampleRefs.has(row);

const sampleCount = (row: LogListRow, index: SampleIndex): number =>
  shownSampleCount(row, index) ?? 0;

const TaskCell: FC<{ row: LogListRow; name: string }> = ({ row, name }) => {
  const index = useSampleIndex();
  const open = useOpenRows(openSampleRows).has(row.id);
  const sample = sampleRefs.get(row);
  if (sample) {
    return (
      <div className="pro-task-cell pro-task-sub" title={sample.id}>
        <span className="pro-task-name">{row.task || sample.id}</span>
        <small> · epoch {sample.epoch}</small>
      </div>
    );
  }
  const n = sampleCount(row, index);
  if (row.type !== "file" || n === 0) {
    return (
      <div className="pro-task-cell">
        <span className="pro-task-caret-gap" />
        <span className="pro-task-name">{name}</span>
      </div>
    );
  }
  if (n === 1) {
    return (
      <div
        className="pro-task-cell"
        title="One sample: clicking the row opens it directly"
      >
        <span className="pro-task-caret-gap" />
        <span className="pro-task-name">{name}</span>
        <small className="pro-task-what" aria-hidden="true">
          →
        </small>
      </div>
    );
  }
  return (
    <div
      className="pro-task-cell"
      title={`Clicking the row opens the list of ${n} samples; the caret lists them here`}
    >
      <button
        type="button"
        className="pro-task-caret"
        aria-expanded={open}
        aria-label={
          open ? "Hide this log's samples" : "List this log's samples"
        }
        onClick={(e) => {
          own(e);
          openSampleRows.toggle(row.id);
        }}
      >
        {open ? "▾" : "▸"}
      </button>
      <span className="pro-task-name">{name}</span>
    </div>
  );
};

const Histogram: FC<{ stats: ScoreStats; maxShare: number }> = ({
  stats,
  maxShare,
}) => {
  const width = 60;
  const height = 16;
  const barWidth = width / stats.bins.length;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
    >
      <line
        x1="0"
        x2={width}
        y1={height - 0.5}
        y2={height - 0.5}
        className="pro-hist-axis"
      />
      {stats.bins.map((count, i) => {
        if (count === 0 || maxShare === 0) return null;
        const h = Math.max(1.5, ((count / stats.n) * (height - 1)) / maxShare);
        return (
          <rect
            key={i}
            x={i * barWidth + 0.5}
            width={barWidth - 1}
            y={height - 1 - h}
            height={h}
            fill={css(prgn((i + 0.5) / stats.bins.length))}
          />
        );
      })}
    </svg>
  );
};

/** A score badge on this row's own scale, so a 0–10 log never reads /100. */
const Badge: FC<{ value: number; top: number | null }> = ({ value, top }) => {
  const label = scoreLabel(value, top);
  if (top === null) return <span>{label.value}</span>;
  const rgb = prgn(value / top);
  const style: Record<string, string> = {
    "--pro-badge-bg": css(rgb),
    "--pro-badge-fg": isDark(rgb) ? "#fff" : "#2a2a2e",
  };
  return (
    <span data-pro-badge="" data-pro-of={label.of} style={style}>
      {label.value}
    </span>
  );
};

/** The score a row shows, on the scale its badge uses. */
const rowScore = (
  row: LogListRow,
  index: SampleIndex
): { value: number; top: number | null } | null => {
  const sample = sampleRefs.get(row);
  if (sample) {
    return row.score === undefined
      ? null
      : { value: row.score, top: sample.top ?? scaleTop([row.score]) };
  }
  const value = shownScore(row, index);
  if (value === undefined) return null;
  return { value, top: shownScale(row, index) };
};

const slotCache = new WeakMap<GridRow[], { index: SampleIndex; ch: number }>();

/** The badge width every row of the table shares. */
const scoreSlotCh = (rows: GridRow[], index: SampleIndex): number => {
  const hit = slotCache.get(rows);
  if (hit && hit.index === index) return hit.ch;
  const ch = badgeSlotCh(
    rows.flatMap((r) => {
      const score = rowScore(r.original, index);
      return score ? [scoreLabel(score.value, score.top)] : [];
    })
  );
  slotCache.set(rows, { index, ch });
  return ch;
};

/** Badge in a slot as wide as the table's widest, then the histogram, so
 *  histograms line up down the column. `data-pro-own` keeps the
 *  column-wide badge pass off it. */
const ScoreCell: FC<{ row: LogListRow; rows: GridRow[] }> = ({ row, rows }) => {
  const index = useSampleIndex();
  const score = rowScore(row, index);
  if (score === null) return <div>-</div>;
  const stats = isSubRow(row) ? null : (index.stats.get(logKey(row)) ?? null);
  const style: Record<string, string> = {
    "--pro-score-ch": String(scoreSlotCh(rows, index)),
  };
  return (
    <div className="pro-score" data-pro-own="" style={style}>
      <span className="pro-score-value">
        <Badge value={score.value} top={score.top} />
      </span>
      {stats && stats.top !== null && (
        <span
          className="pro-hist"
          title={`${statsHint(stats, row.score === undefined)}\nbar height: share of samples; the tallest bar in the table is ${Math.round(index.maxShare * 100)}%`}
        >
          <Histogram stats={stats} maxShare={index.maxShare} />
        </span>
      )}
    </div>
  );
};

const kGroupHint =
  "Sorted by score within each scale, never across scales. Logs don't record a score's range, so each log's scale is guessed from its largest sample score: up to 1, 10 or 100.";

const GroupHead: FC<{ group: ScaleGroup; count: number }> = ({
  group,
  count,
}) => (
  <div className="pro-task-cell pro-score-group" title={kGroupHint}>
    <span className="pro-task-caret-gap" />
    <span className="pro-task-name">{scaleGroupLabel(group)}</span>
    <small>
      · {count} {count === 1 ? "log" : "logs"}
    </small>
  </div>
);

/** A cell that stays empty on scale-group header rows. */
const blankOnGroupHeads = (c: Column): Column =>
  Object.assign({}, c, {
    cell: (ctx: CellCtx) =>
      groupHeads.has(ctx.row.original) ? null : flexRender(c.cell, ctx),
  });

/** A status icon needs no label: the header is an icon, with a hint. */
const StatusHeader: FC = () => (
  <span className="pro-status-head" aria-label="Status">
    <Icon name="success" />
  </span>
);

const ArgsCell: FC<{ row: LogListRow }> = ({ row }) => {
  const open = useOpenRows(openArgsRows).has(row.id);
  const args = row.taskArgsRaw;
  if (!args || Object.keys(args).length === 0 || isSubRow(row))
    return <div>-</div>;
  return (
    // The whole cell toggles, so a second click lands on the same control
    // wherever the first one was; selecting text does not toggle.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      className={open ? "pro-args open" : "pro-args"}
      onClick={(e) => {
        own(e);
        if (window.getSelection()?.isCollapsed === false) return;
        openArgsRows.toggle(row.id);
      }}
    >
      <span className="pro-args-caret" aria-hidden="true">
        {open ? "▾" : "▸"}
      </span>
      {open ? (
        <div className="pro-args-full">
          {Object.entries(args).map(([key, value]) => (
            <div key={key} className="pro-args-row">
              <span className="pro-args-key">{key}</span>
              <pre className="pro-args-value">{argsDetail(value)}</pre>
            </div>
          ))}
        </div>
      ) : (
        <span className="pro-args-line">
          {argsSummary(args).map(({ key, value }, i) => (
            <span key={key}>
              {i > 0 && <span className="pro-args-sep"> · </span>}
              <span className="pro-args-key">{key}</span>{" "}
              <span className="pro-args-value">{value}</span>
            </span>
          ))}
        </span>
      )}
    </div>
  );
};

const ArgsHeader: FC<HeaderCtx> = ({ table }) => {
  const open = useOpenRows(openArgsRows);
  const ids = table
    .getRowModel()
    .rows.map((r) => r.original)
    .filter(
      (r) =>
        !isSubRow(r) && r.taskArgsRaw && Object.keys(r.taskArgsRaw).length > 0
    )
    .map((r) => r.id);
  const anyOpen = ids.some((id) => open.has(id));
  return (
    <span className="pro-args-head">
      Task Args
      <button
        type="button"
        className="pro-args-all"
        title={
          anyOpen
            ? "Fold every row's task args"
            : "Show every row's task args in full"
        }
        onClick={(e) => {
          own(e);
          openArgsRows.setAll(anyOpen ? [] : ids);
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {anyOpen ? "▾ all" : "▸ all"}
      </button>
    </span>
  );
};

const taskName = (ctx: CellCtx): string => {
  const value = ctx.getValue();
  return typeof value === "string" ? value : ctx.row.original.name;
};

/** Pro-ux cells for the Tasks table: an icon-wide Status, a sample caret in
 *  Task, readable Task args, a score with its histogram, then Samples.
 *  Upstream's columns otherwise. */
export const useProLogListColumns = (
  columns: Column[],
  mode: string
): Column[] => {
  const pro = useHtmlFlag("data-pro-ux");
  const index = useSampleIndex();
  return useMemo(() => {
    if (!pro || mode !== "tasks") return columns;
    // Object.assign, not a spread: a spread of the column-def union loses
    // which variant (accessor function or key) each column is.
    const mapped = columns.map((c): Column => {
      switch (c.id) {
        case "status":
          return Object.assign({}, c, {
            size: 30,
            minSize: 30,
            maxSize: 80,
            header: () => <StatusHeader />,
            headerTitle: "Status",
            cell: (ctx: CellCtx) => (
              <div className="pro-status-cell">{flexRender(c.cell, ctx)}</div>
            ),
          });
        case "totalSamples":
          return Object.assign({}, c, {
            accessorFn: (row: LogListRow) => shownSampleCount(row, index),
          });
        case "task":
          return Object.assign({}, c, {
            cell: (ctx: CellCtx) => {
              const head = groupHeads.get(ctx.row.original);
              return head ? (
                <GroupHead {...head} />
              ) : (
                <TaskCell row={ctx.row.original} name={taskName(ctx)} />
              );
            },
          });
        case "taskArgs":
          return Object.assign({}, c, {
            size: 320,
            maxSize: 900,
            header: (ctx: HeaderCtx) => <ArgsHeader {...ctx} />,
            headerTitle: "Task Args",
            titleValue: () => undefined,
            cell: (ctx: CellCtx) => <ArgsCell row={ctx.row.original} />,
          });
        case "score":
          // The accessor falls back to the sample mean so the column no
          // longer reads as empty when logs carry no headline metric.
          return Object.assign({}, c, {
            size: 170,
            maxSize: 220,
            headerTitle:
              "Headline metric, or the mean of sample scores when the log has none; histogram of sample scores",
            accessorFn: (row: LogListRow) => shownScore(row, index),
            cell: (ctx: CellCtx) => (
              <ScoreCell
                row={ctx.row.original}
                rows={ctx.table.getCoreRowModel().rows}
              />
            ),
          });
        default:
          return c;
      }
    });
    return moveAfter(
      mapped.map((c) => (c.id === "task" ? c : blankOnGroupHeads(c))),
      "totalSamples",
      "score"
    );
  }, [pro, mode, columns, index]);
};

/** The listing query's accessors, reading Score and Samples as the Tasks
 *  table shows them. The key changes with the sample index, so the query
 *  re-sorts as sample scores load. */
export const useProListingAccessors = (
  mode: string,
  getValue: ValueAccessor<LogListRow>,
  getComparator: (columnId: string) => ValueComparator | undefined,
  accessorsKey: string
): {
  getValue: ValueAccessor<LogListRow>;
  getComparator: (columnId: string) => ValueComparator | undefined;
  accessorsKey: string;
} => {
  const pro = useHtmlFlag("data-pro-ux");
  const index = useSampleIndex();
  return useMemo(() => {
    if (!pro || mode !== "tasks")
      return { getValue, getComparator, accessorsKey };
    return {
      ...tasksListingAccessors({ getValue, getComparator }, index),
      accessorsKey: `${accessorsKey}|pro-tasks:${index.signature}`,
    };
  }, [pro, mode, getValue, getComparator, accessorsKey, index]);
};
