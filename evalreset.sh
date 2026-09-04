#!/usr/bin/env bash
# Reset all evaluation lanes to a clean start from the default branch.
#
#   ./eval-reset.sh            # DRY RUN — prints the plan, changes nothing
#   ./eval-reset.sh --apply    # actually does it
#
# Archives the current lane tips as tags first, so the PRs and diffs behind
# your existing scorecard stay inspectable after the reset.
set -uo pipefail
REPO="${REPO:-iamkayleb/bukay}"
LANES=(eval/claude eval/codex eval/cursor)
STAMP="$(date +%Y%m%d)"
APPLY=0; [ "${1:-}" = "--apply" ] && APPLY=1

say(){ printf '%s\n' "$*"; }
run(){ if [ "$APPLY" -eq 1 ]; then eval "$@"; else say "    would: $*"; fi; }

DEFAULT=$(gh api "repos/$REPO" -q .default_branch)
say "repo=$REPO  default=$DEFAULT  mode=$([ $APPLY -eq 1 ] && echo APPLY || echo DRY-RUN)"
say ""

# ---- 1. archive current lane tips ------------------------------------------
say "== 1. Archive lane tips as tags =="
for lane in "${LANES[@]}"; do
  sha=$(gh api "repos/$REPO/branches/${lane//\//%2F}" -q .commit.sha 2>/dev/null)
  if [ -z "$sha" ]; then say "  $lane — does not exist yet, nothing to archive"; continue; fi
  tag="archive/${lane//\//-}-$STAMP"
  say "  $lane @ ${sha:0:8}  ->  tag $tag"
  run "gh api repos/$REPO/git/refs -f ref='refs/tags/$tag' -f sha='$sha' --silent 2>/dev/null || true"
done

# ---- 2. close open PRs targeting the lanes ---------------------------------
say ""
say "== 2. Close open PRs targeting eval lanes =="
for lane in "${LANES[@]}"; do
  for pr in $(gh pr list --repo "$REPO" --base "$lane" --state open --json number -q '.[].number' 2>/dev/null); do
    say "  close PR #$pr (base $lane)"
    run "gh pr comment $pr --repo $REPO --body 'Closing: evaluation lanes are being reset to a common baseline before round 1. The branch is preserved and this PR remains readable.'"
    run "gh pr close $pr --repo $REPO"
  done
done

# ---- 3. close stale evaluation issues --------------------------------------
say ""
say "== 3. Close previous evaluation issues =="
for lbl in "eval:round-1" "eval:round-2" "eval:round-3" "follow-up"; do
  for n in $(gh issue list --repo "$REPO" --label "$lbl" --state open --json number -q '.[].number' 2>/dev/null); do
    say "  close issue #$n (label $lbl)"
    run "gh issue close $n --repo $REPO --comment 'Closing: superseded by the reset round-1 baseline.'"
  done
done

# ---- 4. reset lane branches to the default branch --------------------------
say ""
say "== 4. Reset lanes to $DEFAULT =="
base=$(gh api "repos/$REPO/git/ref/heads/$DEFAULT" -q .object.sha)
say "  $DEFAULT @ ${base:0:8}"
for lane in "${LANES[@]}"; do
  if gh api "repos/$REPO/branches/${lane//\//%2F}" -q .name >/dev/null 2>&1; then
    say "  reset  $lane  ->  ${base:0:8}"
    run "gh api -X PATCH repos/$REPO/git/refs/heads/${lane//\//%2F} -F sha='$base' -F force=true --silent"
  else
    say "  create $lane  ->  ${base:0:8}"
    run "gh api repos/$REPO/git/refs -f ref='refs/heads/$lane' -f sha='$base' --silent"
  fi
done

# ---- 5. delete stale per-issue agent branches ------------------------------
say ""
say "== 5. Delete stale agent working branches =="
for pre in claude/issue- codex/issue- cursor/issue-; do
  for b in $(gh api "repos/$REPO/branches?per_page=100" -q ".[].name" 2>/dev/null | grep "^$pre" || true); do
    say "  delete $b"
    run "gh api -X DELETE repos/$REPO/git/refs/heads/${b//\//%2F} --silent 2>/dev/null || true"
  done
done

say ""
if [ "$APPLY" -eq 1 ]; then
  say "Done. All three lanes now sit at $DEFAULT. Seed round 1 with dry_run:true first."
else
  say "DRY RUN — nothing changed. Re-run with --apply to execute."
fi
