import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FC, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import {
  kKindColour,
  kKindLabel,
  kKindOrder,
  useHtmlFlag,
  type SpanKind,
} from "@tsmono/inspect-components/pro-ux";

import { getApi } from "../app_config";
import type { ExtendedColumnDef } from "../app/shared/data-grid/columnTypes";
import type { SampleRow } from "../app/shared/samples-grid/types";
// eslint-disable-next-line no-restricted-imports -- the barrel has no plain fetch; this digest must not sit in the sample cache
import { fetchSample } from "../log_data/sampleFetch";

import { emptyColumnIds } from "./emptyColumns";
import { useProPref } from "./prefs";
import {
  digestSample,
  formatAxisTotal,
  sharedInput,
  type TrajectoryAxisName,
  type TrajectoryDigest,
} from "./trajectory";

const kAxisKey = "pro-ux-trajectory-axis";
const kPrefetchLimit = 50;

let axis: TrajectoryAxisName = (() => {
  try {
    return localStorage.getItem(kAxisKey) === "seconds" ? "seconds" : "tokens";
  } catch {
    return "tokens";
  }
})();
const axisListeners = new Set<() => void>();

const setAxis = (next: TrajectoryAxisName): void => {
  axis = next;
  try {
    localStorage.setItem(kAxisKey, next);
  } catch {
    // Storage unavailable: the choice still applies to this page.
  }
  for (const listener of axisListeners) listener();
};

const subscribeAxis = (listener: () => void): (() => void) => {
  axisListeners.add(listener);
  return () => axisListeners.delete(listener);
};

const useAxis = (): TrajectoryAxisName =>
  useSyncExternalStore(subscribeAxis, () => axis);

/** Loaded totals per log, so every row of a log shares one x scale. */
const totals = new Map<string, Map<string, TrajectoryDigest>>();
const totalListeners = new Set<() => void>();

const noteDigest = (logFile: string, key: string, digest: TrajectoryDigest) => {
  let byLog = totals.get(logFile);
  if (!byLog) {
    byLog = new Map();
    totals.set(logFile, byLog);
  }
  byLog.set(key, digest);
  for (const listener of totalListeners) listener();
};

const subscribeTotals = (listener: () => void): (() => void) => {
  totalListeners.add(listener);
  return () => totalListeners.delete(listener);
};

const useScaleMax = (logFile: string, which: TrajectoryAxisName): number =>
  useSyncExternalStore(subscribeTotals, () => {
    let max = 0;
    for (const digest of totals.get(logFile)?.values() ?? []) {
      max = Math.max(max, digest[which].total);
    }
    return max;
  });

/** Kinds that occur in this log's loaded trajectories, in key order. */
const usePresentKinds = (
  logFile: string,
  which: TrajectoryAxisName
): SpanKind[] => {
  const present = useSyncExternalStore(subscribeTotals, () => {
    const seen = new Set<SpanKind>();
    for (const digest of totals.get(logFile)?.values() ?? []) {
      for (const span of digest[which].spans) seen.add(span.kind);
      if (digest.error) seen.add("error");
    }
    return kKindOrder.filter((kind) => seen.has(kind)).join(" ");
  });
  return useMemo(
    () =>
      present
        ? kKindOrder.filter((kind) => present.split(" ").includes(kind))
        : [],
    [present]
  );
};

const trajectoryQuery = (row: SampleRow) => {
  const key = `${row.sampleId}/${row.epoch}`;
  return {
    queryKey: ["pro-ux", "trajectory", row.logFile, row.sampleId, row.epoch],
    queryFn: async (): Promise<TrajectoryDigest> => {
      const sample = await fetchSample(
        getApi(),
        row.logFile,
        row.sampleId,
        row.epoch
      );
      const digest = digestSample(sample);
      noteDigest(row.logFile, key, digest);
      return digest;
    },
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  } as const;
};

const isComplete = (row: SampleRow): boolean =>
  (row.completed ?? row.data?.completed) !== false;

const TrajectoryCell: FC<{ row: SampleRow }> = ({ row }) => {
  const which = useAxis();
  const complete = isComplete(row);
  const query = useQuery({ ...trajectoryQuery(row), enabled: complete });
  const max = useScaleMax(row.logFile, which);
  if (!complete) return <div className="pro-traj pro-traj-note">running</div>;
  if (query.isError) {
    return (
      <div className="pro-traj pro-traj-note" title={String(query.error)}>
        could not load
      </div>
    );
  }
  if (!query.data) return <div className="pro-traj pro-traj-loading" />;
  const { spans, total } = query.data[which];
  const width = Math.max(max, total, 1e-9);
  const minWidth = width / 300;
  const error = query.data.error;
  return (
    <div className="pro-traj">
      <svg
        className="pro-traj-strip"
        viewBox={`0 0 ${width} 10`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${spans.length} spans, ${formatAxisTotal(which, total)}`}
      >
        <rect
          className="pro-traj-base"
          x={0}
          y={4.5}
          width={total}
          height={1}
        />
        {spans.map((span, i) => (
          <rect
            key={i}
            className="pro-traj-span"
            x={span.start}
            y={0}
            width={Math.max(span.end - span.start, minWidth)}
            height={10}
            fill={kKindColour[span.kind]}
          >
            <title>{span.label}</title>
          </rect>
        ))}
      </svg>
      <span className="pro-traj-total">{formatAxisTotal(which, total)}</span>
      <span
        className="pro-traj-error"
        style={{ background: error ? kKindColour.error : "transparent" }}
        title={error ? `sample error: ${error}` : undefined}
      />
    </div>
  );
};

const TrajectoryHeader: FC<{ logFile: string }> = ({ logFile }) => {
  const which = useAxis();
  const kinds = usePresentKinds(logFile, which);
  return (
    <span className="pro-traj-head">
      Trajectory
      {kinds.map((kind) => (
        <span
          key={kind}
          className="pro-traj-swatch"
          style={{ background: kKindColour[kind] }}
          title={kKindLabel[kind]}
        />
      ))}
    </span>
  );
};

const kTrajectoryColumn: ExtendedColumnDef<SampleRow> = {
  id: "trajectory",
  header: ({ table }) => (
    <TrajectoryHeader
      logFile={table.getCoreRowModel().rows[0]?.original.logFile ?? ""}
    />
  ),
  headerTitle:
    "Each sample's conversation, left to right, on one scale for the whole log. Hover a span for what it is.",
  size: 320,
  minSize: 140,
  flex: 2,
  enableSorting: false,
  cell: ({ row }) => <TrajectoryCell row={row.original} />,
};

const useTrajectoryEnabled = (): boolean => {
  const skin = useHtmlFlag("data-pro-ux");
  const pref = useProPref("trajectoryColumn");
  return skin && pref;
};

/** Columns whose cells wrap over several lines in list mode. */
const kTallColumns = ["input", "target", "answer", "error"];

/** The trajectory column after Input; when every row shares one input, the
 *  trajectory takes Input's place (TrajectoryBar shows the input once), and
 *  rows drop to one line if no other tall column has anything to show. */
export const useTrajectoryColumns = (
  columns: ExtendedColumnDef<SampleRow>[],
  items: SampleRow[],
  multiline: boolean | undefined
): { columns: ExtendedColumnDef<SampleRow>[]; multiline?: boolean } => {
  const enabled = useTrajectoryEnabled();
  const shared = useMemo(
    () => (enabled ? sharedInput(items.map((i) => i.input)) : undefined),
    [enabled, items]
  );
  usePrefetchTrajectories(enabled ? items : undefined);
  return useMemo(() => {
    if (!enabled) return { columns, multiline };
    const at = columns.findIndex((c) => c.id === "input");
    const out = [...columns];
    if (at < 0) {
      const epoch = out.findIndex((c) => c.id === "epoch");
      out.splice(epoch + 1, 0, kTrajectoryColumn);
    } else if (shared !== undefined) {
      out.splice(at, 1, { ...kTrajectoryColumn, flex: 3 });
    } else {
      out.splice(at + 1, 0, kTrajectoryColumn);
    }
    if (shared === undefined || !multiline) return { columns: out, multiline };
    const tall = out.filter((c) => c.id && kTallColumns.includes(c.id));
    const empty = emptyColumnIds(tall, items);
    return {
      columns: out,
      multiline: tall.some((c) => c.id && !empty.has(c.id)),
    };
  }, [enabled, columns, shared, items, multiline]);
};

/** Small logs load every trajectory up front so the shared scale is settled
 *  before scrolling; larger ones load as rows scroll into view. */
const usePrefetchTrajectories = (items: SampleRow[] | undefined): void => {
  const client = useQueryClient();
  // eslint-disable-next-line tsmono/no-raw-use-effect -- prefetch is a fire-and-forget side effect of the rows
  useEffect(() => {
    if (!items || items.length > kPrefetchLimit) return;
    for (const row of items) {
      if (!isComplete(row)) continue;
      client.prefetchQuery(trajectoryQuery(row)).catch(() => undefined);
    }
  }, [client, items]);
};

/** Key and axis switch for the trajectory column, plus the input every
 *  sample shares (shown once instead of on every row). */
export const TrajectoryBar: FC<{ items: SampleRow[] }> = ({ items }) => {
  const enabled = useTrajectoryEnabled();
  const which = useAxis();
  const [open, setOpen] = useState(false);
  const shared = useMemo(
    () => (enabled ? sharedInput(items.map((i) => i.input)) : undefined),
    [enabled, items]
  );
  const kinds = usePresentKinds(items[0]?.logFile ?? "", which);
  if (!enabled) return null;
  return (
    <div className="pro-traj-bar">
      {shared !== undefined ? (
        <button
          type="button"
          className={open ? "pro-traj-input open" : "pro-traj-input"}
          onClick={() => setOpen(!open)}
          title={open ? "Click to fold" : "Click to show the whole input"}
        >
          <span className="pro-traj-caret">{open ? "▾" : "▸"}</span>
          <span className="pro-traj-label">
            Input, the same for all {items.length} samples:
          </span>{" "}
          <span className="pro-traj-text">{shared}</span>
        </button>
      ) : null}
      <div className="pro-traj-key">
        <span className="pro-traj-label">Trajectory</span>
        {kinds.map((kind) => (
          <span key={kind} className="pro-traj-key-item">
            <span
              className="pro-traj-swatch"
              style={{ background: kKindColour[kind] }}
            />
            {kKindLabel[kind]}
          </span>
        ))}
        <span className="pro-seg pro-traj-seg">
          <span>x</span>
          {(["tokens", "seconds"] as const).map((name) => (
            <button
              key={name}
              type="button"
              className={which === name ? "on" : undefined}
              onClick={() => setAxis(name)}
              title={
                name === "tokens"
                  ? "Width = text length (characters ÷ 4 ≈ tokens), in conversation order"
                  : "Width = wall-clock time; gaps are time spent outside model and tool calls"
              }
            >
              {name === "tokens" ? "≈ tokens" : "seconds"}
            </button>
          ))}
        </span>
        <span className="pro-traj-note">
          one scale per log · red cap: sample error
        </span>
      </div>
    </div>
  );
};
