# pro-UX fork of the Inspect log viewer

A local restyle of `inspect view`: EB Garamond, greys, small caps, keyboard
first, details on hover. Upstream stays the source of truth; this is a thin
layer replayed on top of it.

## Layout

- `src/inspect_ai/_view/ts-mono/` (submodule, branch `pro-ux`): all viewer
  changes live in `apps/inspect/src/pro-ux/`. The only upstream file touched
  is `apps/inspect/src/main.tsx` (one import line).
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
inspect view`). Press `?` for shortcuts and `T` to flip to upstream's look.

## Rebase-safety rules

- New behaviour goes in `pro-ux/`, never inline in upstream components.
- Match upstream CSS-module classes by fragment, `[class*="_name_"]`. A
  rename then drops one rule; it never conflicts.
- Find controls by role, aria-label or visible text, not by component.
