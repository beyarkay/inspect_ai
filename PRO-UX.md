# pro-UX fork of the Inspect log viewer

A local restyle of `inspect view`: EB Garamond, greys, small caps, keyboard
first, details on hover. Upstream stays the source of truth; this is a thin
layer replayed on top of it.

## Layout

- `src/inspect_ai/_view/ts-mono/` (submodule, branch `pro-ux`): new code
  lives in `apps/inspect/src/pro-ux/` (app) and
  `packages/inspect-components/src/pro-ux/` (shared transcript pieces).
- Upstream files touched, each by a few lines that call into `pro-ux/`:
  `main.tsx`, `App.tsx`, `ApplicationNavbar.tsx`, `DataGrid.tsx` (+ its
  auto-size test), `samples-grid/cells.tsx`, `SampleScoresGrid.tsx`,
  `ModelEventView.tsx`, `ScoreEventView.tsx`, `TranscriptLayout.tsx`,
  `TranscriptVirtualList.tsx`, `TimelineMinimap.tsx`, `transcript/types.ts`,
  `outline/{OutlineRow,useOutlineNodes,useOutlineWidth}`, and one export line
  in `inspect-components/package.json`. List them with
  `git -C src/inspect_ai/_view/ts-mono diff --stat pro-ux-base..pro-ux`.
- `pro-ux-base` tag in ts-mono: the upstream commit the `pro-ux` branch sits on.
- This repo (branch `pro-ux`): `scripts/pro-ux-sync.sh`, this file, and one
  regenerated commit, `pro-ux: rebuild bundled viewer`, holding the built
  `src/inspect_ai/_view/dist/` and the submodule pointer.

## Pull in upstream changes

```sh
scripts/pro-ux-sync.sh
```

1. Drops the old build commit.
2. Rebases this repo's `pro-ux` onto `upstream/main`.
3. Rebases ts-mono `pro-ux` onto the ts-mono commit upstream pins.
4. Rebuilds the viewer and commits it.

On a conflict it stops and prints the command to continue.

## Edit the viewer

```sh
pnpm -C src/inspect_ai/_view/ts-mono/apps/inspect exec vite \
  --config .agents/skills/verify-log-viewer/vite.verify.config.ts   # :5179
inspect view start --log-dir <logs> --port 7677                    # its API
```

Commit inside ts-mono, then `scripts/pro-ux-sync.sh --build-only`.

## Use it

Install this checkout (`uv pip install -e ~/projects/open_source/inspect_ai`)
or run it in place (`uv run --project ~/projects/open_source/inspect_ai
inspect view`).

- `?` lists shortcuts; `T` flips to upstream's look; `b` pins the sidebar.
- Hover the left edge: samples of the open log, then Preferences (theme,
  soft-wrap tables, empty-column collapsing, and a toggle per feature).
- Transcript: outline row per turn and tool call, a tick per model call on
  the time bar, captions saying what each model call received and which
  tools it called, a collapsible score card.
- Scores: JSON/XML answers and explanations as foldable trees.
- Tables: resizing one column leaves the rest alone; empty columns sit last.

## Rebase-safety rules

- New behaviour goes in `pro-ux/`, never inline in upstream components.
- Match upstream CSS-module classes by fragment, `[class*="_name_"]`. A
  rename then drops one rule; it never conflicts.
- Find controls by role, aria-label or visible text, not by component.
