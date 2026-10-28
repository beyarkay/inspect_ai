# pro-UX fork of the Inspect log viewer

A restyle of `inspect view`: EB Garamond, greys, small caps, keyboard first,
details on demand. Published at <https://github.com/beyarkay/inspect_ai>
(branch `main`). Upstream stays the source of truth; this is a thin layer
merged on top of it.

## Layout

- This repo, branch `main`: upstream Inspect plus `scripts/pro-ux-sync.sh`,
  this file, `.gitmodules` pointing at the fork, and the built viewer in
  `src/inspect_ai/_view/dist/`.
- `src/inspect_ai/_view/ts-mono/` (submodule, local branch `main`, pushed to
  the fork's `viewer` branch): new code lives in `apps/inspect/src/pro-ux/`,
  `packages/inspect-components/src/pro-ux/` and `packages/react/src/pro-ux/`.
- Upstream viewer files touched, each by a few lines that call into `pro-ux/`:

  ```sh
  cd src/inspect_ai/_view/ts-mono
  git diff --stat "$(git merge-base main origin/main)" main -- . ':!**/pro-ux/**'
  ```

## Pull in upstream changes

```sh
scripts/pro-ux-sync.sh
```

1. Merges the ts-mono commit upstream Inspect pins into the viewer's `main`.
2. Merges `upstream/main` into this repo's `main`. The built viewer and the
   submodule pointer conflict on every bump; the script keeps ours, since
   both are regenerated next.
3. Rebuilds the viewer and commits it.
4. Pushes both to the fork. `--no-push` skips this.

Merging, not rebasing, keeps the published `main` free of force-pushes. On
any other conflict the script stops and says how to continue.

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

- `?` lists shortcuts; `T` flips to upstream's look.
- **Sidebar:** the button at the top left. Hover to peek, click (or `b`) to
  dock, click again to float. In windows at least 1200px wide it docks by
  itself while a sample is open, so the list sits left and the transcript
  right; `auto` in its header undoes a manual choice. Preferences live at its
  foot, with an off switch per feature.
- **Breadcrumbs:** never clipped; each `›` lists that folder's folders and
  logs, `…` lists the folded path.
- **Tables:** value bars after token counts and durations; score badges;
  resizing one column leaves the rest alone; empty columns go last at 28px;
  optional soft-wrap.
- **Sample table:** a trajectory strip per sample (tokens or seconds); an
  input every sample shares is shown once above the table.
- **Transcript:**
  - outline hidden behind its own peek-or-dock button;
  - time bar coloured by event kind, with a key;
  - simple shell calls read `[>_] cat app.py`;
  - collapsible tool calls;
  - "more" only when over four lines are hidden, with "less" in the same spot;
  - hover hints on model-call tabs;
  - a copy button on each message;
  - grep search runs as you type;
  - Cmd-F opens a find bar that reaches off-screen events.
- **Scores:** JSON and XML as trees, fully open, with a depth control.
- **Colours:** user blue, assistant green, reasoning pink, tool orange,
  system sky, everywhere (`packages/inspect-components/src/pro-ux/kinds.ts`).

## Merge-safety rules

- New behaviour goes in `pro-ux/`, never inline in upstream components.
- Match upstream CSS-module classes by fragment, `[class*="_name_"]`. A
  rename then drops one rule; it never conflicts.
- Gate every upstream hook on `data-pro-ux`, so `T` restores upstream.
- A layout toggle never moves when clicked: click the same spot to undo.
