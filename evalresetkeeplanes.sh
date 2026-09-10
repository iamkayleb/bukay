#!/usr/bin/env bash
# Strip the eval AUTOMATION, keep the agent pipeline and the three lanes.
#
#   ./eval-reset-keep-lanes.sh            # DRY RUN
#   ./eval-reset-keep-lanes.sh --apply
#
# KEEPS ENABLED: auto-pilot, belt dispatcher/worker/conveyor, issue intake,
#   keepalive, gate followups, verifier, gate, ci, autofix — the machinery that
#   produced PR #229. You drive it by hand, one issue at a time.
# KEEPS: eval/claude, eval/codex, eval/cursor (reset to the default branch).
# DISABLES: only the three workflows I added for automated seeding/routing.
set -uo pipefail
REPO="${REPO:-iamkayleb/bukay}"
APPLY=0; [ "${1:-}" = "--apply" ] && APPLY=1
run(){ if [ "$APPLY" -eq 1 ]; then eval "$@"; else echo "    would: $*"; fi; }

DEFAULT=$(gh api "repos/$REPO" -q .default_branch)
echo "repo=$REPO  default=$DEFAULT  mode=$([ $APPLY -eq 1 ] && echo APPLY || echo DRY-RUN)"

echo
echo "== 1. Disable ONLY the eval automation =="
for wf in eval-seed-issues.yml eval-lane-automation.yml eval-auto-followup.yml; do
  if gh api "repos/$REPO/contents/.github/workflows/$wf" -q .name >/dev/null 2>&1; then
    echo "  disable $wf"
    run "gh workflow disable '$wf' --repo $REPO 2>/dev/null || true"
  else
    echo "  (absent) $wf"
  fi
done
echo "  agent pipeline left ENABLED: auto-pilot, belt, intake, keepalive, verifier, gate, ci"

echo
echo "== 2. Close the seeded issues =="
gh issue list --repo "$REPO" --label "eval:round-1" --state open --limit 50 \
  --json number -q '.[].number' | while read -r n; do
    [ -z "$n" ] && continue
    echo "  close #$n"
    run "gh issue close $n --repo $REPO --comment 'Closing: switching to hand-driven issues on the eval lanes.'"
  done

echo
echo "== 3. Delete leftover agent working branches =="
gh api "repos/$REPO/branches?per_page=100" -q '.[].name' 2>/dev/null \
  | grep -E "^(claude|codex|cursor)/issue-" | while read -r b; do
      echo "  delete $b"
      run "gh api -X DELETE repos/$REPO/git/refs/heads/${b//\//%2F} --silent 2>/dev/null || true"
    done

echo
echo "== 4. Reset the three lanes to $DEFAULT (kept, not removed) =="
base=$(gh api "repos/$REPO/git/ref/heads/$DEFAULT" -q .object.sha)
echo "  $DEFAULT @ ${base:0:8}"
for lane in eval/claude eval/codex eval/cursor; do
  if gh api "repos/$REPO/branches/${lane//\//%2F}" -q .name >/dev/null 2>&1; then
    echo "  reset  $lane"
    run "gh api -X PATCH repos/$REPO/git/refs/heads/${lane//\//%2F} -F sha='$base' -F force=true --silent"
  else
    echo "  create $lane"
    run "gh api repos/$REPO/git/refs -f ref='refs/heads/$lane' -f sha='$base' --silent"
  fi
done

echo
[ "$APPLY" -eq 1 ] && echo "Done. Lanes clean, agent pipeline intact. See eval/MANUAL.md for the per-issue recipe." \
                   || echo "DRY RUN — nothing changed. Re-run with --apply."
