#!/usr/bin/env bash
# Diagnose and restart the current evaluation round.
#
#   ./eval-kick.sh            # report only
#   ./eval-kick.sh --apply    # clear blockers AND dispatch auto-pilot
#
# Uses only `gh` (its --jq is built in). No external jq, so this works in
# Git Bash on Windows.
set -uo pipefail
REPO="${REPO:-iamkayleb/bukay}"
ROUND="${ROUND:-1}"
APPLY=0; [ "${1:-}" = "--apply" ] && APPLY=1
run(){ if [ "$APPLY" -eq 1 ]; then eval "$@"; else echo "      would: $*"; fi; }

mapfile -t ISSUES < <(gh issue list --repo "$REPO" --label "eval:round-$ROUND" \
  --state open --json number -q '.[].number' | sort -n)
[ "${#ISSUES[@]}" -eq 0 ] && { echo "No open issues labelled eval:round-$ROUND"; exit 0; }

echo "repo=$REPO  round=$ROUND  issues=${ISSUES[*]}"
echo "mode=$([ $APPLY -eq 1 ] && echo APPLY || echo REPORT-ONLY)"
echo

echo "═══ 1. Where each issue stands ═══"
# One API call for the whole auto-pilot history, then filter per issue locally.
gh run list --repo "$REPO" --workflow=agents-auto-pilot.yml --limit 100 \
  --json displayTitle,conclusion,status,createdAt,url \
  -q '.[] | [.displayTitle, (.conclusion // .status), .createdAt[:16], .url] | @tsv' \
  > /tmp/ap-runs.tsv 2>/dev/null || : > /tmp/ap-runs.tsv
echo "  (auto-pilot runs found: $(wc -l < /tmp/ap-runs.tsv))"
echo
for n in "${ISSUES[@]}"; do
  labels=$(gh issue view "$n" --repo "$REPO" --json labels -q '[.labels[].name]|join(",")')
  hit=$(grep -m1 -E "(#|issue_number=)$n([^0-9]|$)" /tmp/ap-runs.tsv || true)
  if [ -n "$hit" ]; then
    concl=$(printf '%s' "$hit" | cut -f2)
    when=$(printf '%s' "$hit" | cut -f3)
    url=$(printf '%s' "$hit" | cut -f4)
    ap="$concl  $when  $url"
  else
    ap="never ran (no auto-pilot run mentions this issue)"
  fi
  br=$(gh api "repos/$REPO/branches?per_page=100" -q '.[].name' 2>/dev/null \
       | grep -E "/issue-$n$" | tr '\n' ' ')
  printf '  #%s\n    labels    : %s\n    auto-pilot: %s\n    branch    : %s\n' \
    "$n" "$labels" "$ap" "${br:-none}"
done

echo
echo "═══ 2. Clear blockers ═══"
for n in "${ISSUES[@]}"; do
  labels=$(gh issue view "$n" --repo "$REPO" --json labels -q '[.labels[].name]|join(",")')
  for l in needs-human agents:auto-pilot-pause agents:format agents:paused; do
    if [[ ",$labels," == *",$l,"* ]]; then
      echo "  #$n drop $l"
      run "gh issue edit $n --repo $REPO --remove-label '$l'"
    fi
  done
done

echo
echo "═══ 3. Dispatch auto-pilot (unlabeled events do NOT wake it) ═══"
for n in "${ISSUES[@]}"; do
  echo "  #$n dispatch"
  run "gh workflow run agents-auto-pilot.yml --repo $REPO -f issue_number=$n -f force_step=auto"
  [ "$APPLY" -eq 1 ] && sleep 5
done

echo
if [ "$APPLY" -eq 1 ]; then
  echo "Dispatched. Watch: gh run list --repo $REPO --workflow=agents-auto-pilot.yml --limit 10"
else
  echo "REPORT ONLY — nothing changed. Re-run with --apply."
fi
