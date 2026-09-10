#!/usr/bin/env bash
# Repair ONE stuck issue: swap in the formatter-immune body, clear the pause,
# and re-trigger auto-pilot. Touches nothing else.
#
#   ./eval/fix-one-issue.sh 260            # DRY RUN
#   ./eval/fix-one-issue.sh 260 --apply
set -uo pipefail
REPO="${REPO:-iamkayleb/bukay}"
N="${1:?usage: fix-one-issue.sh <issue-number> [--apply]}"
APPLY=0; [ "${2:-}" = "--apply" ] && APPLY=1
run(){ if [ "$APPLY" -eq 1 ]; then eval "$@"; else echo "    would: $*"; fi; }

body=$(gh issue view "$N" --repo "$REPO" --json body -q .body)
spec=$(printf '%s' "$body" | grep -oE '<!-- eval-spec: [^ ]+ -->'  | head -1 | sed 's/.*eval-spec: //; s/ -->//')
agent=$(printf '%s' "$body" | grep -oE '<!-- eval-agent: [^ ]+ -->' | head -1 | sed 's/.*eval-agent: //; s/ -->//')
round=$(printf '%s' "$body" | grep -oE '<!-- eval-round: [0-9]+ -->'| head -1 | sed 's/.*eval-round: //; s/ -->//')

if [ -z "$spec" ] || [ -z "$agent" ] || [ -z "$round" ]; then
  echo "#$N is missing eval-spec / eval-agent / eval-round markers — cannot match a body."
  echo "Markers found:"; printf '%s' "$body" | grep -oE '<!-- eval-[a-z]+: [^ ]+ -->' || echo "  (none)"
  exit 1
fi

f="eval/issues/$(printf 'round-%02d' "$round")/$spec--$agent.md"
echo "#$N  spec=$spec  agent=$agent  round=$round"
echo "  source: $f"
[ -f "$f" ] || { echo "  ! no rendered body at that path"; exit 1; }

if printf '%s' "$body" | grep -q '<summary>Original Issue</summary>'; then
  echo "  already formatter-immune — nothing to swap"
else
  echo "  replace body"
  run "gh issue edit $N --repo $REPO --body-file '$f'"
fi

echo "  clear pause labels"
for l in agents:auto-pilot-pause needs-human agents:format; do
  run "gh issue edit $N --repo $REPO --remove-label '$l' 2>/dev/null || true"
done

echo "  re-trigger auto-pilot (fires on 'labeled', so remove then add)"
run "gh issue edit $N --repo $REPO --remove-label 'agents:auto-pilot' 2>/dev/null || true"
run "sleep 3"
run "gh issue edit $N --repo $REPO --add-label 'agents:auto-pilot'"

echo
[ "$APPLY" -eq 1 ] && echo "Done. Watch: gh issue view $N --repo $REPO --comments | tail -20" \
                   || echo "DRY RUN — nothing changed. Re-run with --apply."
