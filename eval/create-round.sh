#!/usr/bin/env bash
# Create the issues for ONE round, from the pre-rendered bodies in eval/issues/.
#
#   ./eval/create-round.sh 1            # DRY RUN — prints what it would create
#   ./eval/create-round.sh 1 --apply
#   ./eval/create-round.sh 1 --apply --agent claude    # one lane only
#
# Idempotent: skips a (round, spec, agent) whose issue already exists, matched on
# the `<!-- eval-spec: -->` + `<!-- eval-agent: -->` markers, so re-running is safe.
set -uo pipefail
REPO="${REPO:-iamkayleb/bukay}"
ROUND="${1:?usage: create-round.sh <round> [--apply] [--agent <name>]}"
shift || true
APPLY=0; ONLY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1 ;;
    --agent) shift; ONLY="${1:-}" ;;
  esac
  shift || true
done
RD=$(printf 'round-%02d' "$ROUND")
DIR="eval/issues/$RD"
[ -d "$DIR" ] || { echo "no such directory: $DIR"; exit 1; }

echo "repo=$REPO  round=$ROUND  mode=$([ $APPLY -eq 1 ] && echo APPLY || echo DRY-RUN)${ONLY:+  agent=$ONLY}"
echo

# Existing markers for this round, so re-runs do not duplicate.
existing=$(gh issue list --repo "$REPO" --label "eval:round-$ROUND" --state all --limit 200 \
  --json body -q '.[].body' 2>/dev/null \
  | grep -oE '<!-- eval-(spec|agent): [^ ]+ -->' | tr '\n' ' ')

created=0; skipped=0
for f in "$DIR"/*.md; do
  base=$(basename "$f" .md)
  spec="${base%%--*}"
  agent="${base##*--}"
  [ -n "$ONLY" ] && [ "$agent" != "$ONLY" ] && continue

  # a matching issue needs BOTH markers present in the same round
  if gh issue list --repo "$REPO" --label "eval:round-$ROUND" --state all --limit 200 \
       --json body -q '.[].body' 2>/dev/null \
     | grep -q "<!-- eval-spec: $spec -->" \
     && gh issue list --repo "$REPO" --label "eval:round-$ROUND" --state all --limit 200 \
       --json body,title -q ".[] | select(.body|contains(\"<!-- eval-spec: $spec -->\")) | select(.body|contains(\"<!-- eval-agent: $agent -->\")) | .title" \
       2>/dev/null | grep -q .; then
    echo "  skip (exists)  $spec / $agent"
    skipped=$((skipped+1)); continue
  fi

  title=$(python -c "
import json,sys
rows=json.load(open('eval/issues/index.json'))
print(next(r['title'] for r in rows if r['round']==$ROUND and r['spec']=='$spec' and r['agent']=='$agent'))
" 2>/dev/null) || title="[eval r$ROUND] $spec ($agent)"

  echo "  create  $spec / $agent  -> base eval/$agent"
  if [ "$APPLY" -eq 1 ]; then
    gh issue create --repo "$REPO" \
      --title "$title" \
      --body-file "$f" \
      --label "agent:$agent" \
      --label "agents:auto-pilot" \
      --label "eval:round-$ROUND" \
      || echo "    ! failed"
    sleep 3
  fi
  created=$((created+1))
done

echo
echo "  would create: $created   already present: $skipped"
[ "$APPLY" -eq 0 ] && echo "  DRY RUN — re-run with --apply"
