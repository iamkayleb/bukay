#!/usr/bin/env bash
# Replace the body of already-created eval issues with the formatter-immune
# version, so auto-pilot skips the LLM reformatter instead of rewriting (and
# breaking) them.
#
#   ./eval/fix-issue-bodies.sh 1            # DRY RUN
#   ./eval/fix-issue-bodies.sh 1 --apply
#
# Matches each open issue to its rendered body via the <!-- eval-spec --> and
# <!-- eval-agent --> markers, so it cannot update the wrong issue.
set -uo pipefail
REPO="${REPO:-iamkayleb/bukay}"
ROUND="${1:?usage: fix-issue-bodies.sh <round> [--apply]}"
APPLY=0; [ "${2:-}" = "--apply" ] && APPLY=1
DIR="eval/issues/$(printf 'round-%02d' "$ROUND")"
[ -d "$DIR" ] || { echo "no such directory: $DIR"; exit 1; }

echo "repo=$REPO round=$ROUND mode=$([ $APPLY -eq 1 ] && echo APPLY || echo DRY-RUN)"
echo

gh issue list --repo "$REPO" --label "eval:round-$ROUND" --state open --limit 50 \
  --json number,title,body -q '.[] | "\(.number)\t\(.title)"' \
| while IFS=$'\t' read -r n title; do
    [ -z "$n" ] && continue
    body=$(gh issue view "$n" --repo "$REPO" --json body -q .body)
    spec=$(printf '%s' "$body" | grep -oE '<!-- eval-spec: [^ ]+ -->' | head -1 | sed 's/.*eval-spec: //; s/ -->//')
    agent=$(printf '%s' "$body" | grep -oE '<!-- eval-agent: [^ ]+ -->' | head -1 | sed 's/.*eval-agent: //; s/ -->//')
    if [ -z "$spec" ] || [ -z "$agent" ]; then
      echo "  #$n  SKIP — no eval-spec/eval-agent marker ($title)"
      continue
    fi
    f="$DIR/$spec--$agent.md"
    if [ ! -f "$f" ]; then
      echo "  #$n  SKIP — no rendered body at $f"
      continue
    fi
    if printf '%s' "$body" | grep -q '<summary>Original Issue</summary>'; then
      echo "  #$n  already immune ($spec/$agent)"
      continue
    fi
    echo "  #$n  replace body from $f  ($spec/$agent)"
    if [ "$APPLY" -eq 1 ]; then
      gh issue edit "$n" --repo "$REPO" --body-file "$f" || echo "    ! failed"
      # clear the pause so auto-pilot can retry; re-adding auto-pilot re-triggers it
      gh issue edit "$n" --repo "$REPO" \
        --remove-label "agents:auto-pilot-pause" --remove-label "needs-human" \
        --remove-label "agents:format" 2>/dev/null || true
      sleep 2
    fi
  done

echo
if [ "$APPLY" -eq 1 ]; then
  echo "Bodies replaced. Re-trigger by removing and re-adding agents:auto-pilot:"
  echo "  gh issue edit <n> --repo $REPO --remove-label agents:auto-pilot"
  echo "  gh issue edit <n> --repo $REPO --add-label agents:auto-pilot"
else
  echo "DRY RUN — nothing changed. Re-run with --apply."
fi
