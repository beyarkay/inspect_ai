#!/usr/bin/env bash
# Merge the latest upstream Inspect into our main, rebuild the bundled viewer,
# commit, and push both repos to the fork. See PRO-UX.md.
#
#   scripts/pro-ux-sync.sh              merge upstream into both repos, rebuild, push
#   scripts/pro-ux-sync.sh --build-only rebuild after editing viewer code, push
#   scripts/pro-ux-sync.sh --no-push    either of the above, without pushing
set -euo pipefail

ROOT=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
VIEW="$ROOT/src/inspect_ai/_view/ts-mono"
GITLINK=src/inspect_ai/_view/ts-mono
DIST=src/inspect_ai/_view/dist
BUILD_SUBJECT="pro-ux: rebuild bundled viewer"

build_only=false
push=true
for arg in "$@"; do
  case "$arg" in
    --build-only) build_only=true ;;
    --no-push) push=false ;;
    *)
      echo "unknown option $arg" >&2
      exit 2
      ;;
  esac
done

die() {
  echo "pro-ux-sync: $*" >&2
  exit 1
}

for repo in "$ROOT" "$VIEW"; do
  git -C "$repo" diff --quiet -- . ":(exclude)$GITLINK" ":(exclude)$DIST" ||
    die "uncommitted changes in $repo; commit or stash them first"
  git -C "$repo" diff --cached --quiet || die "staged changes in $repo"
  [ "$(git -C "$repo" branch --show-current)" = main ] || die "check out main in $repo"
done

if ! $build_only; then
  echo "── fetching upstream"
  git -C "$ROOT" fetch -q upstream
  git -C "$VIEW" fetch -q origin

  # Merge the commit upstream Inspect pins, not ts-mono main, so the viewer
  # matches this version of the Python package.
  pinned=$(git -C "$ROOT" ls-tree upstream/main "$GITLINK" | awk '{print $3}')
  [ -n "$pinned" ] || die "could not read the pinned ts-mono commit"
  echo "── merging ts-mono $pinned"
  git -C "$VIEW" merge -q --no-ff --no-edit "$pinned" ||
    die "merge stopped in $VIEW: resolve, commit, then rerun"

  echo "── merging upstream/main"
  if ! git -C "$ROOT" merge -q --no-ff --no-edit upstream/main; then
    git -C "$ROOT" rev-parse -q --verify MERGE_HEAD >/dev/null ||
      die "merging upstream/main failed in $ROOT before any conflict"
    # The bundle and the viewer pin conflict on every upstream bump; both are
    # regenerated below, so keep ours for now.
    git -C "$ROOT" checkout -q HEAD -- "$DIST"
    git -C "$ROOT" add -A "$DIST"
    git -C "$ROOT" update-index --cacheinfo "160000,$(git -C "$VIEW" rev-parse HEAD),$GITLINK"
    conflicts=$(git -C "$ROOT" diff --name-only --diff-filter=U)
    [ -z "$conflicts" ] ||
      die "merge stopped in $ROOT on: $conflicts; resolve, commit, then rerun with --build-only"
    git -C "$ROOT" commit -q --no-edit
  fi
fi

echo "── building the viewer"
pnpm -C "$VIEW" install --frozen-lockfile
pnpm -C "$VIEW" --filter @meridianlabs/log-viewer build

git -C "$ROOT" add -A "$GITLINK" "$DIST"
if git -C "$ROOT" diff --cached --quiet; then
  echo "── nothing to rebuild"
else
  git -C "$ROOT" commit -q -m "$BUILD_SUBJECT" \
    -m "ts-mono $(git -C "$VIEW" rev-parse --short HEAD)"
  echo "── committed: $(git -C "$ROOT" log -1 --format='%h %s')"
fi

if $push; then
  echo "── pushing"
  git -C "$VIEW" push -q fork main:viewer
  git -C "$ROOT" push -q fork main
fi
echo "restart 'inspect view' to pick up the new viewer"
