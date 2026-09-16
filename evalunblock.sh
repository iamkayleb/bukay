#!/usr/bin/env bash
# Clear the optimizer recursion-guard state on the current round's issues.
#   ./eval-unblock.sh            # DRY RUN
#   ./eval-unblock.sh --apply
#
# The guard window is one rolling hour, so it also clears itself. This removes
# the stuck labels so auto-pilot can re-attempt immediately.
set -uo pipefail
REPO="${REPO:-iamkayleb/bukay}"
ROUND="${ROUND:-1}"
APPLY=0; [ "${1:-}" = "--apply" ] && APPLY=1
run(){ if [ "$APPLY" -eq 1 ]; then eval "$@"; else echo "    would: $*"; fi; }

mapfile -t ISSUES < <(gh issue list --repo "$REPO" --label "eval:round-$ROUND" \
  --state open --json number -q '.[].number')
if [ "${#ISSUES[@]}" -eq 0 ]; then echo "No open issues for eval:round-$ROUND"; exit 0; fi
echo "round $ROUND issues: ${ISSUES[*]}"
echo "mode: $([ $APPLY -eq 1 ] && echo APPLY || echo DRY-RUN)"
echo

for n in "${ISSUES[@]}"; do
  labels=$(gh issue view "$n" --repo "$REPO" --json labels -q '[.labels[].name]|join(",")')
  echo "#$n  [$labels]"
  for l in agents:format needs-human agents:auto-pilot-pause; do
    if [[ ",$labels," == *",$l,"* ]]; then
      echo "  drop $l"
      run "gh issue edit $n --repo $REPO --remove-label '$l'"
    fi
  done
  # re-arm auto-pilot only if it lost its label
  if [[ ",$labels," != *",agents:auto-pilot,"* ]]; then
    echo "  restore agents:auto-pilot"
    run "gh issue edit $n --repo $REPO --add-label 'agents:auto-pilot'"
  fi
done

echo
echo "== optimizer runs in the last hour, per issue =="
for n in "${ISSUES[@]}"; do
  c=$(gh run list --repo "$REPO" --workflow=agents-issue-optimizer.yml --limit 100 \
      --json createdAt,displayTitle 2>/dev/null \
      | jq --arg cut "$(date -u -d '1 hour ago' '+%Y-%m-%dT%H:%M:%SZ')" --arg i "#$n" \
        '[.[]|select(.createdAt > $cut and (.displayTitle|endswith($i))
          and (.displayTitle|contains("[noop]")|not))]|length')
  printf '  #%s  %s work run(s) %s\n' "$n" "$c" "$([ "${c:-0}" -gt 3 ] && echo '← still over budget' || echo '')"
done
[ "$APPLY" -eq 0 ] && echo && echo "DRY RUN — nothing changed. Re-run with --apply."
