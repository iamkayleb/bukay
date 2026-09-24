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
ROUND="${1:?usage: create-round.sh <round> [--apply] [--agent <name>] [--spec <id>]}"
shift || true
APPLY=0; ONLY=""; ONLYSPEC=""
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1 ;;
    --agent) shift; ONLY="${1:-}" ;;
    --spec)  shift; ONLYSPEC="${1:-}" ;;
  esac
  shift || true
done
RD=$(printf 'round-%02d' "$ROUND")
DIR="eval/issues/$RD"
[ -d "$DIR" ] || { echo "no such directory: $DIR"; exit 1; }

# gh issue create validates labels up front and aborts if one is missing, so
# make sure every label this round needs exists before creating anything.
ensure_label() {
  local name="$1" color="$2" desc="$3"
  if gh label list --repo "$REPO" --limit 200 --json name -q '.[].name' 2>/dev/null \
     | grep -qxF "$name"; then
    return 0
  fi
  echo "  + creating missing label: $name"
  if [ "$APPLY" -eq 1 ]; then
    gh label create "$name" --repo "$REPO" --color "$color" --description "$desc" 2>/dev/null \
      || echo "    ! could not create label $name"
  fi
}
ensure_label "eval:round-$ROUND" "BFD4F2" "Evaluation round $ROUND"
ensure_label "agents:auto-pilot" "0E8A16" "Auto-pilot drives this issue end to end"
ALL_AGENTS="claude codex cursor gemini"
for a in $ALL_AGENTS; do
  ensure_label "agent:$a" "5319E7" "Route this work to $a"
  # Lane isolation. On a stall the auto-pilot rotates the issue to the next
  # untried agent in registry order (agent_stall_rotation.js), which silently
  # puts another agent's work on this lane's branch and rewrites the agent:*
  # label the scoring reads. Pre-marking every OTHER agent as tried leaves the
  # rotation no candidate, so a stall escalates to needs-human instead of
  # crossing lanes. Observed on bukay #363: a Cursor-lane PR carrying a commit
  # authored by Codex and a keepalive report attributed to Claude.
  ensure_label "agents:tried-$a" "D4C5F9" "Records an agent already tried during bounded stall rotation"
done

echo "repo=$REPO  round=$ROUND  mode=$([ $APPLY -eq 1 ] && echo APPLY || echo DRY-RUN)${ONLY:+  agent=$ONLY}${ONLYSPEC:+  spec=$ONLYSPEC}"
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
  [ -n "$ONLYSPEC" ] && [ "$spec" != "$ONLYSPEC" ] && continue

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

  # Every agent except this lane's, marked tried, so stall rotation cannot
  # hand the issue to another lane's agent.
  tried_flags=""
  for a in $ALL_AGENTS; do
    [ "$a" = "$agent" ] && continue
    tried_flags="$tried_flags --label agents:tried-$a"
  done

  echo "  create  $spec / $agent  -> base eval/$agent  (rotation pinned)"
  if [ "$APPLY" -eq 1 ]; then
    gh issue create --repo "$REPO" \
      --title "$title" \
      --body-file "$f" \
      --label "agent:$agent" \
      --label "agents:auto-pilot" \
      --label "eval:round-$ROUND" \
      $tried_flags \
      || echo "    ! failed"
    sleep 3
  fi
  created=$((created+1))
done

echo
echo "  would create: $created   already present: $skipped"
[ "$APPLY" -eq 0 ] && echo "  DRY RUN — re-run with --apply"
