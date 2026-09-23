#!/usr/bin/env bash
# Add the missing <!-- base-branch: eval/<agent> --> marker to follow-up issues
# created before the propagation fix landed, so the belt cuts from the lane
# instead of the default branch.
#
#   ./patch-followup-base.sh 319 321            # DRY RUN
#   ./patch-followup-base.sh --apply 319 321
#   ./patch-followup-base.sh --apply --retrigger 319 321
#
# --retrigger additionally closes any PR already cut from the wrong base,
# deletes that branch, clears blocking labels, and re-fires auto-pilot.
set -uo pipefail
REPO="${REPO:-iamkayleb/bukay}"
APPLY=0; RETRIGGER=0
ARGS=()
for a in "$@"; do
  case "$a" in
    --apply) APPLY=1 ;;
    --retrigger) RETRIGGER=1 ;;
    *) ARGS+=("$a") ;;
  esac
done
[ "${#ARGS[@]}" -eq 0 ] && { echo "usage: patch-followup-base.sh [--apply] [--retrigger] ISSUE..."; exit 1; }
run(){ if [ "$APPLY" -eq 1 ]; then eval "$@"; else echo "      would: $*"; fi; }

TMP="${TMPDIR:-/tmp}"
echo "repo=$REPO  mode=$([ $APPLY -eq 1 ] && echo APPLY || echo DRY-RUN)$([ $RETRIGGER -eq 1 ] && echo '  +retrigger')"
echo

for n in "${ARGS[@]}"; do
  echo "── issue #$n"
  body=$(gh issue view "$n" --repo "$REPO" --json body -q .body 2>/dev/null)
  if [ -z "$body" ]; then echo "    ! cannot read issue"; continue; fi

  if printf '%s' "$body" | grep -q '<!-- *base-branch:'; then
    echo "    already has a base-branch marker — skipping"
    continue
  fi

  agent=$(gh issue view "$n" --repo "$REPO" --json labels \
          -q '[.labels[].name] | map(select(startswith("agent:"))) | .[0] // ""' 2>/dev/null | sed 's/^agent://')
  if [ -z "$agent" ]; then echo "    ! no agent:* label — cannot infer the lane"; continue; fi
  lane="eval/$agent"

  if ! gh api "repos/$REPO/branches/${lane//\//%2F}" -q .name >/dev/null 2>&1; then
    echo "    ! lane branch $lane does not exist — refusing"
    continue
  fi
  echo "    agent=$agent  lane=$lane"

  # Prepend the marker, preserving the body byte-for-byte after it.
  printf '<!-- base-branch: %s -->\n\n%s' "$lane" "$body" > "$TMP/issue-$n.md"
  echo "    prepend marker -> $TMP/issue-$n.md ($(wc -l < "$TMP/issue-$n.md") lines)"
  run "gh issue edit $n --repo $REPO --body-file '$TMP/issue-$n.md'"

  if [ "$RETRIGGER" -eq 1 ]; then
    for b in $(gh api "repos/$REPO/branches?per_page=100" -q '.[].name' 2>/dev/null \
               | grep -E "^${agent}/issue-$n$" || true); do
      pr=$(gh pr list --repo "$REPO" --head "$b" --state open --json number,baseRefName \
           -q '.[] | select(.baseRefName != "'"$lane"'") | .number' 2>/dev/null | head -1)
      if [ -n "$pr" ]; then
        echo "    close PR #$pr (wrong base)"
        run "gh pr close $pr --repo $REPO --comment 'Closing: branch was cut from the default branch instead of $lane. Re-cutting from the lane.'"
      fi
      echo "    delete branch $b"
      run "gh api -X DELETE repos/$REPO/git/refs/heads/${b//\//%2F} --silent 2>/dev/null || true"
    done
    for l in needs-human agents:auto-pilot-pause agents:format; do
      run "gh issue edit $n --repo $REPO --remove-label '$l' 2>/dev/null || true"
    done
    echo "    re-fire auto-pilot (it triggers on 'labeled')"
    run "gh issue edit $n --repo $REPO --remove-label 'agents:auto-pilot' 2>/dev/null || true"
    run "sleep 3"
    run "gh issue edit $n --repo $REPO --add-label 'agents:auto-pilot'"
  fi
  echo
done

[ "$APPLY" -eq 0 ] && echo "DRY RUN — nothing changed. Re-run with --apply."
