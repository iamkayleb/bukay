#!/usr/bin/env bash
# Abandon a round's issues cleanly so it can be seeded fresh from the current
# rendered bodies. Closes the issues, strips the round label (so the seeder's
# idempotency check does not skip them), closes their PRs, deletes their
# branches. Does NOT touch the lane branches or main.
#
#   ./eval/reseed-round.sh 6            # DRY RUN
#   ./eval/reseed-round.sh 6 --apply
set -uo pipefail
REPO="${REPO:-iamkayleb/bukay}"
ROUND="${1:?usage: reseed-round.sh <round> [--apply]}"
APPLY=0; [ "${2:-}" = "--apply" ] && APPLY=1
run(){ if [ "$APPLY" -eq 1 ]; then eval "$@"; else echo "      would: $*"; fi; }

echo "repo=$REPO round=$ROUND mode=$([ $APPLY -eq 1 ] && echo APPLY || echo DRY-RUN)"
echo

mapfile -t NUMS < <(gh issue list --repo "$REPO" --label "eval:round-$ROUND" --state all \
  --limit 100 --json number -q '.[].number' | sort -n)
if [ "${#NUMS[@]}" -eq 0 ]; then
  echo "  no issues carry eval:round-$ROUND — nothing to clear"
else
  echo "== 1. Close and unlabel round-$ROUND issues =="
  for n in "${NUMS[@]}"; do
    state=$(gh issue view "$n" --repo "$REPO" --json state -q .state)
    echo "  #$n ($state)"
    [ "$state" = "OPEN" ] && run "gh issue close $n --repo $REPO --comment 'Closing: reseeding this round from corrected specifications.'"
    # strip the round label so create-round.sh does not treat it as already seeded
    run "gh issue edit $n --repo $REPO --remove-label 'eval:round-$ROUND' 2>/dev/null || true"
  done

  echo
  echo "== 2. Close PRs and delete branches for those issues =="
  for n in "${NUMS[@]}"; do
    for b in $(gh api "repos/$REPO/branches?per_page=100" -q '.[].name' 2>/dev/null \
               | grep -E "^(claude|codex|cursor)/issue-$n$" || true); do
      pr=$(gh pr list --repo "$REPO" --head "$b" --state open --json number -q '.[].number' 2>/dev/null | head -1)
      if [ -n "$pr" ]; then
        echo "  close PR #$pr (head $b)"
        run "gh pr close $pr --repo $REPO --comment 'Closing: issue reseeded from corrected specifications.'"
      fi
      echo "  delete branch $b"
      run "gh api -X DELETE repos/$REPO/git/refs/heads/${b//\//%2F} --silent 2>/dev/null || true"
    done
  done
fi

echo
echo "== 3. Verify the rendered bodies are the corrected ones =="
DIR="eval/issues/$(printf 'round-%02d' "$ROUND")"
if [ -d "$DIR" ]; then
  bad=0
  for f in "$DIR"/*.md; do
    grep -q '<summary>Original Issue</summary>' "$f" || { echo "  ✗ $(basename "$f") not formatter-immune"; bad=1; }
    grep -qE '`[^`]*\.github/' "$f" && { echo "  ✗ $(basename "$f") still cites .github in prose"; bad=1; }
  done
  [ "$bad" -eq 0 ] && echo "  ✅ $(ls "$DIR"/*.md | wc -l) bodies look correct"
else
  echo "  ✗ $DIR missing — extract the latest bundle before seeding"
fi

echo
if [ "$APPLY" -eq 1 ]; then
  echo "Cleared. Now seed:"
  echo "  ./eval/create-round.sh $ROUND            # dry run"
  echo "  ./eval/create-round.sh $ROUND --apply"
else
  echo "DRY RUN — nothing changed. Re-run with --apply."
fi
