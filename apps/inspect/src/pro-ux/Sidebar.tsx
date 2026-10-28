import { FC, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Link } from "react-router";

import { useCurrentSampleHandle } from "../app/routing/currentSelection";
import { useSampleNavigationActions } from "../app/routing/sampleNavigation";
import { sampleIdsEqual } from "../app/shared/sample";
import type { SampleSummary } from "../client/api/types";
import { useFilteredSamples } from "../state/hooks";
import { useUserSettings } from "../state/userSettings";

import { scaleTop } from "./cells";
import { css, isDark, prgn } from "./colour";
import {
  getPrefs,
  kPrefKeys,
  kPrefLabels,
  setPref,
  subscribePrefs,
} from "./prefs";
import { allSame, commonIdPrefix } from "./sampleLabels";
import {
  getDockChoice,
  isWide,
  resolveDocked,
  setDockChoice,
  subscribeSidebar,
  subscribeWide,
} from "./sidebarState";

const kCloseDelayMs = 250;

const formatScore = (score: unknown): string =>
  typeof score === "number" ||
  typeof score === "string" ||
  typeof score === "boolean"
    ? String(score)
    : JSON.stringify(score);

const firstScore = (sample: SampleSummary): unknown => {
  const scores = sample.scores ?? {};
  const first = Object.values(scores)[0];
  return first?.value;
};

const inputPreview = (sample: SampleSummary): string => {
  const input = sample.input;
  if (typeof input === "string") return input;
  for (const message of input) {
    if (message.role !== "user") continue;
    const content = message.content;
    if (typeof content === "string") return content;
    for (const part of content) {
      if (part.type === "text") return part.text;
    }
  }
  return "";
};

const kPrefsOpenKey = "pro-ux-prefs-open";

const PrefsPane: FC = () => {
  const prefs = useSyncExternalStore(subscribePrefs, getPrefs);
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(kPrefsOpenKey) === "1";
    } catch {
      return false;
    }
  });
  const toggleOpen = () => {
    setOpen(!open);
    try {
      localStorage.setItem(kPrefsOpenKey, open ? "0" : "1");
    } catch {
      // Storage unavailable: the section just won't remember.
    }
  };
  const themePreference = useUserSettings((s) => s.themePreference);
  const setThemePreference = useUserSettings((s) => s.setThemePreference);
  const base = themePreference.replace(/^readable-/, "");
  const readable = themePreference.startsWith("readable-");
  const setBase = (next: string) => {
    const value = `${readable ? "readable-" : ""}${next}`;
    if (
      value === "system" ||
      value === "light" ||
      value === "dark" ||
      value === "readable-system" ||
      value === "readable-light" ||
      value === "readable-dark"
    ) {
      setThemePreference(value);
    }
  };
  return (
    <section className="pro-sb-prefs">
      <button
        type="button"
        className="pro-sb-heading pro-sb-toggle"
        aria-expanded={open}
        onClick={toggleOpen}
      >
        {open ? "▾" : "▸"} Preferences
      </button>
      {open && (
        <>
          <div className="pro-seg">
            <span>theme</span>
            {["system", "light", "dark"].map((option) => (
              <button
                key={option}
                type="button"
                className={base === option ? "on" : undefined}
                onClick={() => setBase(option)}
              >
                {option}
              </button>
            ))}
          </div>
          {kPrefKeys.map((key) => {
            const [label, hint] = kPrefLabels[key];
            return (
              <label key={key} className="pro-sb-pref" title={hint}>
                <input
                  type="checkbox"
                  checked={prefs[key]}
                  onChange={(e) => setPref(key, e.target.checked)}
                />
                <span>
                  {label}
                  <small>{hint}</small>
                </span>
              </label>
            );
          })}
          <div className="pro-sb-foot">
            <kbd>T</kbd> switches to upstream&rsquo;s look · <kbd>?</kbd>{" "}
            shortcuts
          </div>
        </>
      )}
    </section>
  );
};

const SidebarIcon: FC<{ pinned: boolean }> = ({ pinned }) => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <rect
      x="1.5"
      y="2.5"
      width="13"
      height="11"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
    />
    <rect
      x="2"
      y="3"
      width="4.5"
      height="10"
      fill={pinned ? "currentColor" : "none"}
    />
    <line
      x1="6.5"
      y1="2.5"
      x2="6.5"
      y2="13.5"
      stroke="currentColor"
      strokeWidth="1.3"
    />
  </svg>
);

/** A fixed top-left button: hover floats the panel open, click (or b) docks
 *  it, click again floats it. The button never moves. Lists the current
 *  log's samples, then preferences. */
export const ProSidebar: FC = () => {
  const samples = useFilteredSamples();
  const current = useCurrentSampleHandle();
  const { getSampleUrl } = useSampleNavigationActions();
  const [open, setOpen] = useState(false);
  const choice = useSyncExternalStore(subscribeSidebar, getDockChoice);
  const wide = useSyncExternalStore(subscribeWide, isWide);
  const pinned = resolveDocked(
    choice,
    wide && current !== undefined && samples.length > 0
  );
  const [query, setQuery] = useState("");
  const closeTimer = useRef<number | undefined>(undefined);

  const top = useMemo(() => {
    const numeric = samples
      .map(firstScore)
      .filter((v): v is number => typeof v === "number");
    return scaleTop(numeric);
  }, [samples]);

  const { idPrefix, sharedInput } = useMemo(
    () => ({
      idPrefix: commonIdPrefix(samples.map((s) => String(s.id))),
      sharedInput: allSame(samples.map(inputPreview)),
    }),
    [samples]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return samples;
    return samples.filter(
      (s) =>
        String(s.id).toLowerCase().includes(q) ||
        inputPreview(s).toLowerCase().includes(q)
    );
  }, [samples, query]);

  const show = open || pinned;
  const cancelClose = () => window.clearTimeout(closeTimer.current);
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), kCloseDelayMs);
  };

  return (
    <>
      <button
        type="button"
        className="pro-sb-button"
        aria-pressed={pinned}
        aria-label={pinned ? "Float the sidebar" : "Dock the sidebar"}
        title={
          pinned
            ? "Sidebar docked: click (or b) to float it"
            : "Hover to peek at samples and preferences; click (or b) to dock"
        }
        onMouseEnter={() => {
          cancelClose();
          setOpen(true);
        }}
        onMouseLeave={scheduleClose}
        onClick={() => {
          setOpen(true);
          setDockChoice(pinned ? "floating" : "docked");
        }}
      >
        <SidebarIcon pinned={pinned} />
      </button>
      {show && (
        <aside
          className="pro-sidebar"
          data-docked={pinned || undefined}
          aria-label="Samples and preferences"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <div className="pro-sb-head">
            <span className="pro-sb-heading">
              Samples <small>{samples.length || ""}</small>
            </span>
            <span className="pro-sb-state">
              <kbd>b</kbd> {pinned ? "docked" : "floating"}
              {choice === null ? (
                <span title="Docked while a sample is open in a wide window">
                  {" "}
                  · auto
                </span>
              ) : (
                <>
                  {" · "}
                  <button
                    type="button"
                    className="pro-sb-auto"
                    title="Dock while a sample is open in a wide window, float otherwise"
                    onClick={() => setDockChoice(null)}
                  >
                    auto
                  </button>
                </>
              )}
            </span>
          </div>
          {samples.length > 0 ? (
            <>
              <input
                className="pro-sb-filter"
                placeholder="filter samples by id or input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {(idPrefix || sharedInput) && (
                <div className="pro-sb-shared">
                  {idPrefix && (
                    <div>
                      ids start <b>{idPrefix}</b>
                    </div>
                  )}
                  {sharedInput && (
                    <div
                      title={samples[0] ? inputPreview(samples[0]) : undefined}
                    >
                      every sample has the same input
                    </div>
                  )}
                </div>
              )}
              <nav className="pro-sb-list">
                {visible.map((sample) => {
                  const href = getSampleUrl(sample.id, sample.epoch);
                  const on =
                    sampleIdsEqual(sample.id, current?.id) &&
                    sample.epoch === current?.epoch;
                  const score = firstScore(sample);
                  const rgb =
                    typeof score === "number" && top !== null
                      ? prgn(score / top)
                      : null;
                  return (
                    <Link
                      key={`${sample.id}-${sample.epoch}`}
                      to={href?.replace(/^#/, "") ?? "."}
                      className={on ? "pro-sb-row on" : "pro-sb-row"}
                    >
                      <span className="pro-sb-id" title={String(sample.id)}>
                        {String(sample.id).slice(idPrefix.length)}
                        <small> · {sample.epoch}</small>
                      </span>
                      {score !== undefined && (
                        <span
                          className="pro-sb-score"
                          style={
                            rgb
                              ? {
                                  background: css(rgb),
                                  color: isDark(rgb) ? "#fff" : "#2a2a2e",
                                }
                              : undefined
                          }
                        >
                          {formatScore(score)}
                        </span>
                      )}
                      {!sharedInput && (
                        <span className="pro-sb-preview">
                          {inputPreview(sample)}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </nav>
            </>
          ) : (
            <div className="pro-sb-empty">Open a log to list its samples.</div>
          )}
          <PrefsPane />
        </aside>
      )}
    </>
  );
};
