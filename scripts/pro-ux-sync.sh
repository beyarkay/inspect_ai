#!/usr/bin/env bash
# Replay the pro-UX viewer on top of the latest upstream Inspect, rebuild the
# bundled viewer, and commit the result. See PRO-UX.md.
#
#   scripts/pro-ux-sync.sh              fetch upstream, rebase both repos, rebuild
#   scripts/pro-ux-sync.sh --build-only rebuild after editing pro-ux code locally
set -euo pipefail

ROOT=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
VIEW="$ROOT/src/inspect_ai/_view/ts-mono"
GITLINK=src/inspect_ai/_view/ts-mono
BUILD_SUBJECT="pro-ux: rebuild bundled viewer"

die() {
  echo "pro-ux-sync: $*" >&2
  exit 1
}

for repo in "$ROOT" "$VIEW"; do
  git -C "$repo" diff --quiet -- . ":(exclude)$GITLINK" ":(exclude)src/inspect_ai/_view/dist" ||
    die "uncommitted changes in $repo; commit or stash them first"
  git -C "$repo" diff --cached --quiet || die "staged changes in $repo"
done
[ "$(git -C "$ROOT" branch --show-current)" = pro-ux ] || die "check out pro-ux in $ROOT"

# The build commit is regenerated every time, so drop it before rebasing.
if [ "$(git -C "$ROOT" log -1 --format=%s)" = "$BUILD_SUBJECT" ]; then
  git -C "$ROOT" reset --hard -q HEAD~1
fi
buried=$(git -C "$ROOT" log --format=%h --fixed-strings --grep="$BUILD_SUBJECT" upstream/main..HEAD)
[ -z "$buried" ] ||
  die "build commit $buried is not the tip; move later commits below it (or drop it) first"
git -C "$VIEW" switch -q pro-ux

if [ "${1:-}" != "--build-only" ]; then
  echo "── fetching upstream"
  git -C "$ROOT" fetch -q upstream
  git -C "$VIEW" fetch -q origin

  echo "── rebasing inspect_ai pro-ux onto upstream/main"
  git -C "$ROOT" rebase -q upstream/main ||
    die "rebase stopped in $ROOT: resolve, 'git rebase --continue', then rerun"

  # Rebase the viewer onto the commit upstream Inspect pins, not ts-mono main,
  # so the viewer matches this version of the Python package.
  pinned=$(git -C "$ROOT" ls-tree upstream/main "$GITLINK" | awk '{print $3}')
  [ -n "$pinned" ] || die "could not read the pinned ts-mono commit"
  echo "── rebasing ts-mono pro-ux onto $pinned"
  git -C "$VIEW" rebase -q --onto "$pinned" pro-ux-base pro-ux ||
    die "rebase stopped in $VIEW: resolve, 'git rebase --continue', 'git tag -f pro-ux-base $pinned', then rerun with --build-only"
  git -C "$VIEW" tag -f pro-ux-base "$pinned" >/dev/null
fi

echo "── building the viewer"
pnpm -C "$VIEW" install --frozen-lockfile
pnpm -C "$VIEW" --filter @meridianlabs/log-viewer build

git -C "$ROOT" add "$GITLINK" src/inspect_ai/_view/dist
if git -C "$ROOT" diff --cached --quiet; then
  echo "── nothing changed"
else
  git -C "$ROOT" commit -q -m "$BUILD_SUBJECT" \
    -m "ts-mono $(git -C "$VIEW" rev-parse --short HEAD) on $(git -C "$VIEW" rev-parse --short pro-ux-base)"
  echo "── committed: $(git -C "$ROOT" log -1 --format='%h %s')"
fi
echo "restart 'inspect view' to pick up the new viewer"
