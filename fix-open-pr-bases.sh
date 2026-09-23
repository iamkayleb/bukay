#!/usr/bin/env bash
# Retarget every open agent PR to its own lane, from the branch name.
# One-off cleanup for PRs opened before the guard existed.
#
#   ./fix-open-pr-bases.sh            # DRY RUN
#   ./fix-open-pr-bases.sh --apply
set -uo pipefail
REPO="${REPO:-iamkayleb/bukay}"
APPLY=0; [ "${1:-}" = "--apply" ] && APPLY=1
run(){ if [ "$APPLY" -eq 1 ]; then eval "$@"; else echo "      would: $*"; fi; }

echo "repo=$REPO  mode=$([ $APPLY -eq 1 ] && echo APPLY || echo DRY-RUN)"
echo

gh pr list --repo "$REPO" --state open --limit 100 \
  --json number,headRefName,baseRefName \
  -q '.[] | select(.headRefName|test("^(claude|codex|cursor)/")) | "\(.number)\t\(.headRefName)\t\(.baseRefName)"' \
| while IFS=$'\t' read -r pr head base; do
    [ -z "$pr" ] && continue
    agent="${head%%/*}"
    lane="eval/$agent"
    if [ "$base" = "$lane" ]; then
      echo "  #$pr  $head  already -> $lane"
      continue
    fi
    if ! gh api "repos/$REPO/branches/${lane//\//%2F}" -q .name >/dev/null 2>&1; then
      echo "  #$pr  $head  SKIP — lane $lane does not exist"
      continue
    fi
    echo "  #$pr  $head  $base -> $lane"
    run "gh pr edit $pr --repo $REPO --base '$lane'"
    [ "$APPLY" -eq 1 ] && sleep 2
  done

echo
[ "$APPLY" -eq 0 ] && echo "DRY RUN — nothing changed. Re-run with --apply." \
                   || echo "Done. New PRs are handled automatically by Eval Lane Base Guard."
