import { FC, useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router";

import {
  navigateAndForget,
  useEventListener,
  useOnClickOutside,
} from "@tsmono/react/hooks";
import { directoryRelativeUrl } from "@tsmono/util";

import { useLogListing, useLogsSync, type LogListingRow } from "../log_data";

import {
  childEntries,
  crumbPath,
  isLogPath,
  logFacts,
  tildePath,
  type LogFacts,
} from "./crumbs";

export interface CrumbSegment {
  text: string;
  url?: string;
}

interface ProBreadcrumbsProps {
  /** Upstream's segments: the log dir's parent, the log dir, then each part
   *  of `currentPath`. */
  segments: CrumbSegment[];
  currentPath: string | undefined;
  logDir: string;
  fnNavigationUrl: (file: string, log_dir?: string) => string;
}

interface MenuItem {
  key: string;
  url?: string;
  primary: string;
  secondary?: string;
  title?: string;
  current?: boolean;
}

/** Room for "…", a separator and a shrunk folder beside the last segment. */
const kCollapsedReserve = 110;

/** Log and sample pages already head with the task, model and sample count. */
const kHeaderFacts = new Set<keyof LogFacts>(["task", "model", "samples"]);

type OpenMenu =
  | { kind: "siblings"; index: number; anchor: HTMLElement }
  | { kind: "hidden"; anchor: HTMLElement };

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const factsOf = (row: LogListingRow): LogFacts => ({
  task: row.task,
  model: row.model,
  status: row.status === "success" ? undefined : row.status,
  samples: row.header?.sampleCount,
  metric: row.primary_metric
    ? { name: row.primary_metric.name, value: row.primary_metric.value }
    : undefined,
  started: row.started_at,
});

/** Every log's path relative to the log dir, keyed to its listing row. */
const useRelativeRows = (logDir: string): Map<string, LogListingRow> => {
  const rows = useLogListing(logDir).data;
  return useMemo(() => {
    const byPath = new Map<string, LogListingRow>();
    for (const row of rows ?? []) {
      const rel = decodeURIComponent(directoryRelativeUrl(row.name, logDir));
      if (rel.startsWith("/") || rel.includes("://")) continue;
      byPath.set(rel, row);
    }
    return byPath;
  }, [rows, logDir]);
};

/** The pro-UX breadcrumb: the last segment is never clipped, earlier ones
 *  shrink with an ellipsis, and each separator opens the folders and logs
 *  beside the next segment. */
export const ProBreadcrumbs: FC<ProBreadcrumbsProps> = (props) => (
  <CrumbList key={props.currentPath ?? ""} {...props} />
);

const CrumbList: FC<ProBreadcrumbsProps> = ({
  segments: allSegments,
  currentPath,
  logDir,
  fnNavigationUrl,
}) => {
  const segments = useMemo(
    () => allSegments.filter((s, i) => i < 2 || s.text !== ""),
    [allSegments]
  );
  const parts = useMemo(
    () => (currentPath ?? "").split("/").filter(Boolean),
    [currentPath]
  );
  const rows = useRelativeRows(logDir);
  const [open, setOpen] = useState<OpenMenu | null>(null);
  // How the crumbs fit, measured on a hidden full-length copy so collapsing
  // never feeds back into the check: "full" shows every segment, "collapsed"
  // folds the middle into "…", "tight" also lets the last segment wrap.
  const [fit, setFit] = useState<"full" | "collapsed" | "tight">("full");

  const measure = useCallback((ol: HTMLOListElement | null) => {
    if (!ol) return;
    const check = () => {
      const width = ol.clientWidth;
      const lastWidth = ol.lastElementChild?.getBoundingClientRect().width ?? 0;
      setFit(
        ol.scrollWidth <= width + 1
          ? "full"
          : lastWidth + kCollapsedReserve <= width
            ? "collapsed"
            : "tight"
      );
    };
    const observer = new ResizeObserver(check);
    observer.observe(ol);
    document.fonts.ready.then(check).catch(() => undefined);
    return () => observer.disconnect();
  }, []);

  const last = segments.length - 1;
  const collapsed = fit !== "full" && segments.length > 3;
  const tight = fit === "tight" || (fit !== "full" && !collapsed);
  const hidden = collapsed ? segments.slice(0, last - 1) : [];
  const shown = segments
    .map((segment, index) => ({ segment, index }))
    .filter(({ index }) => !collapsed || index >= last - 1);

  const logIndex = segments.findIndex(
    (_, i) => i >= 2 && isLogPath(crumbPath(parts, i) ?? "")
  );
  const logRow =
    logIndex >= 0 ? rows.get(crumbPath(parts, logIndex) ?? "") : undefined;
  const info = logRow
    ? logFacts(factsOf(logRow), kHeaderFacts, formatDate)
    : [];

  const close = (refocus: boolean) => {
    if (refocus) open?.anchor.focus();
    setOpen(null);
  };

  const toggle = (next: OpenMenu) =>
    setOpen((prev) =>
      prev &&
      prev.kind === next.kind &&
      (prev.kind === "hidden" ||
        (next.kind === "siblings" && prev.index === next.index))
        ? null
        : next
    );

  return (
    <div className="pro-crumbs-wrap">
      <ol ref={measure} className="pro-crumbs pro-crumbs-measure" aria-hidden>
        {segments.map((segment, index) => (
          <li key={index} className={itemClass(index, last)}>
            {index > 0 && <span className="pro-crumb-btn">›</span>}
            <span className={crumbClass(index, last, parts)}>
              {index === 0 ? tildePath(segment.text) : segment.text}
            </span>
          </li>
        ))}
      </ol>
      <ol className={tight ? "pro-crumbs pro-crumbs-tight" : "pro-crumbs"}>
        {collapsed && (
          <li className="pro-crumb-more-item">
            <button
              type="button"
              className="pro-crumb-btn"
              aria-haspopup="menu"
              aria-expanded={open?.kind === "hidden"}
              title={`${hidden.length} more: ${hidden.map((s) => s.text).join(" / ")}`}
              onClick={(e) =>
                toggle({ kind: "hidden", anchor: e.currentTarget })
              }
            >
              …
            </button>
          </li>
        )}
        {shown.map(({ segment, index }) => {
          const parentPath = crumbPath(parts, index - 1);
          const navigable =
            index >= 2 && parentPath !== undefined && !isLogPath(parentPath);
          const isLast = index === last;
          return (
            <li key={index} className={itemClass(index, last)}>
              {index > 0 &&
                (navigable ? (
                  <button
                    type="button"
                    className="pro-crumb-btn pro-crumb-sep"
                    aria-haspopup="menu"
                    aria-expanded={
                      open?.kind === "siblings" && open.index === index
                    }
                    title={`Folders and logs in ${segments[index - 1]?.text ?? ""}`}
                    onClick={(e) =>
                      toggle({
                        kind: "siblings",
                        index,
                        anchor: e.currentTarget,
                      })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setOpen({
                          kind: "siblings",
                          index,
                          anchor: e.currentTarget,
                        });
                      }
                    }}
                  >
                    ›
                  </button>
                ) : (
                  <span className="pro-crumb-sep-plain" aria-hidden="true">
                    ›
                  </span>
                ))}
              <span
                className={crumbClass(index, last, parts)}
                title={index === 0 ? segment.text : undefined}
              >
                {segment.url && !isLast ? (
                  <Link to={segment.url} title={segment.text}>
                    {segment.text}
                  </Link>
                ) : index === 0 ? (
                  <span dir="ltr">{tildePath(segment.text)}</span>
                ) : (
                  segment.text
                )}
              </span>
            </li>
          );
        })}
        {info.length > 0 && (
          <li className="pro-crumb-info" title={info.join(" · ")}>
            {info.join(" · ")}
          </li>
        )}
      </ol>
      {open?.kind === "hidden" && (
        <CrumbMenu
          anchor={open.anchor}
          heading="Hidden path"
          items={hidden.map((segment, i) => ({
            key: String(i),
            url: segment.url,
            primary: segment.text,
          }))}
          onClose={close}
        />
      )}
      {open?.kind === "siblings" && (
        <SiblingMenu
          anchor={open.anchor}
          dir={crumbPath(parts, open.index - 1) ?? ""}
          dirName={segments[open.index - 1]?.text ?? ""}
          current={crumbPath(parts, open.index) ?? ""}
          rows={rows}
          logDir={logDir}
          fnNavigationUrl={fnNavigationUrl}
          onClose={close}
        />
      )}
    </div>
  );
};

const itemClass = (index: number, last: number): string =>
  index === last ? "pro-crumb-item pro-crumb-item-last" : "pro-crumb-item";

const crumbClass = (index: number, last: number, parts: string[]): string => {
  const kind =
    index === 0
      ? " pro-crumb-root"
      : isLogPath(crumbPath(parts, index) ?? "")
        ? " pro-crumb-log"
        : "";
  return `pro-crumb${kind}${index === last ? " pro-crumb-last" : ""}`;
};

interface SiblingMenuProps {
  anchor: HTMLElement;
  dir: string;
  dirName: string;
  current: string;
  rows: Map<string, LogListingRow>;
  logDir: string;
  fnNavigationUrl: (file: string, log_dir?: string) => string;
  onClose: (refocus: boolean) => void;
}

const SiblingMenu: FC<SiblingMenuProps> = ({
  anchor,
  dir,
  dirName,
  current,
  rows,
  logDir,
  fnNavigationUrl,
  onClose,
}) => {
  // An opened log seeds only its own row; listing the whole dir fills the
  // rest while the menu is open.
  const sync = useLogsSync(logDir, "pro-crumbs");
  const entries = useMemo(
    () => childEntries([...rows.keys()], dir),
    [rows, dir]
  );
  const folders = entries.filter((e) => e.kind === "folder").length;
  const logs = entries.length - folders;
  const counts = [
    folders ? `${folders} folder${folders === 1 ? "" : "s"}` : "",
    logs ? `${logs} log${logs === 1 ? "" : "s"}` : "",
  ]
    .filter(Boolean)
    .join(", ");
  const items: MenuItem[] = entries.map((entry) => {
    const url = fnNavigationUrl(entry.path, logDir);
    if (entry.kind === "folder") {
      return {
        key: entry.path,
        url,
        primary: `${entry.name}/`,
        secondary: `${entry.logs} log${entry.logs === 1 ? "" : "s"}`,
        current: entry.path === current,
      };
    }
    const row = rows.get(entry.path);
    const facts = row ? factsOf(row) : {};
    return {
      key: entry.path,
      url,
      primary: facts.task ?? entry.name,
      secondary: logFacts(
        { ...facts, task: undefined },
        undefined,
        formatDate
      ).join(" · "),
      title: entry.name,
      current: entry.path === current,
    };
  });
  return (
    <CrumbMenu
      anchor={anchor}
      heading={`In ${dirName}/${counts ? ` · ${counts}` : ""}`}
      items={items}
      empty={sync.loading ? "Loading the listing…" : "Empty folder"}
      onClose={onClose}
    />
  );
};

interface CrumbMenuProps {
  anchor: HTMLElement;
  heading: string;
  items: MenuItem[];
  empty?: string;
  onClose: (refocus: boolean) => void;
}

const kFilterThreshold = 8;

const CrumbMenu: FC<CrumbMenuProps> = ({
  anchor,
  heading,
  items,
  empty,
  onClose,
}) => {
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState("");
  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) =>
      [item.primary, item.secondary, item.title].some((text) =>
        text?.toLowerCase().includes(needle)
      )
    );
  }, [items, filter]);
  // null follows the current entry until the user moves.
  const [active, setActive] = useState<number | null>(null);
  const activeIndex = Math.min(
    active ??
      Math.max(
        0,
        shown.findIndex((item) => item.current)
      ),
    Math.max(0, shown.length - 1)
  );

  useOnClickOutside(menuRef, (e) => {
    if (e.target instanceof Node && anchor.contains(e.target)) return;
    onClose(false);
  });
  useEventListener(window, "resize", () => onClose(false));

  const focusOnMount = useCallback((el: HTMLElement | null) => {
    el?.focus({ preventScroll: true });
  }, []);

  const scrollTo = (index: number) =>
    menuRef.current
      ?.querySelectorAll('[role="menuitem"]')
      [index]?.scrollIntoView({ block: "nearest" });

  const move = (index: number) => {
    const next = Math.max(0, Math.min(shown.length - 1, index));
    setActive(next);
    scrollTo(next);
  };

  // Window capture: the page (e.g. a data grid refocusing itself after the
  // listing syncs) can pull focus out of the menu, and keys must still reach it.
  useEventListener(
    window,
    "keydown",
    (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const menu = menuRef.current;
      if (!menu) return;
      const handled = () => {
        e.preventDefault();
        e.stopPropagation();
      };
      switch (e.key) {
        case "ArrowDown":
          handled();
          move(activeIndex + 1);
          return;
        case "ArrowUp":
          handled();
          move(activeIndex - 1);
          return;
        case "Home":
        case "End":
          if (e.target instanceof HTMLInputElement && menu.contains(e.target))
            return;
          handled();
          move(e.key === "Home" ? 0 : shown.length - 1);
          return;
        case "Enter": {
          handled();
          const url = shown[activeIndex]?.url;
          if (url) {
            onClose(false);
            navigateAndForget(navigate, url);
          }
          return;
        }
        case "Escape":
          handled();
          onClose(true);
          return;
        case "Tab":
          onClose(false);
          return;
      }
      const inside = e.target instanceof Node && menu.contains(e.target);
      if (!inside && (e.key.length === 1 || e.key === "Backspace")) {
        menu
          .querySelector<HTMLElement>(".pro-crumb-menu-filter")
          ?.focus({ preventScroll: true });
      }
    },
    { capture: true }
  );

  const rect = anchor.getBoundingClientRect();
  const width = Math.min(560, window.innerWidth - 16);
  const left = Math.max(
    8,
    Math.min(rect.left - 12, window.innerWidth - width - 8)
  );

  return createPortal(
    <div
      ref={menuRef}
      className="pro-crumb-menu"
      role="menu"
      aria-label={heading}
      tabIndex={-1}
      style={{ top: rect.bottom + 4, left, width }}
    >
      <div className="pro-crumb-menu-head">{heading}</div>
      {items.length > kFilterThreshold ? (
        <input
          ref={focusOnMount}
          className="pro-crumb-menu-filter"
          placeholder="filter · ↑↓ move · Enter open · Esc close"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setActive(0);
          }}
        />
      ) : (
        <span
          ref={focusOnMount}
          tabIndex={-1}
          className="pro-crumb-menu-focus"
        />
      )}
      <div className="pro-crumb-menu-list">
        {shown.length === 0 && (
          <div className="pro-crumb-menu-empty">
            {filter ? "No match" : (empty ?? "Nothing here")}
          </div>
        )}
        {shown.map((item, i) => {
          const className = [
            "pro-crumb-menu-item",
            i === activeIndex ? "pro-crumb-menu-active" : "",
            item.current ? "pro-crumb-menu-current" : "",
          ]
            .filter(Boolean)
            .join(" ");
          const body = (
            <>
              <span className="pro-crumb-menu-primary">{item.primary}</span>
              {item.secondary && (
                <span className="pro-crumb-menu-secondary">
                  {item.secondary}
                </span>
              )}
            </>
          );
          return item.url ? (
            <Link
              key={item.key}
              to={item.url}
              role="menuitem"
              tabIndex={-1}
              className={className}
              title={item.title}
              aria-current={item.current ? "page" : undefined}
              onMouseEnter={() => setActive(i)}
              onClick={() => onClose(false)}
            >
              {body}
            </Link>
          ) : (
            <div
              key={item.key}
              role="menuitem"
              aria-disabled="true"
              tabIndex={-1}
              className={`${className} pro-crumb-menu-static`}
              title={item.primary}
              onMouseEnter={() => setActive(i)}
            >
              {body}
            </div>
          );
        })}
      </div>
    </div>,
    document.body
  );
};
