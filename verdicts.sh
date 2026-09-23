#!/usr/bin/env bash
# What did the neutral judge actually say on the recent eval PRs?
REPO="${REPO:-iamkayleb/bukay}"

for pr in 313 312 311 310 309 308 301 300; do
  title=$(gh pr view "$pr" --repo "$REPO" --json title,baseRefName -q '"\(.baseRefName)  \(.title)"' 2>/dev/null)
  [ -z "$title" ] && continue
  echo "══ PR #$pr  $title"

  # the verifier's comparison report
  body=$(gh pr view "$pr" --repo "$REPO" --json comments \
        -q '[.comments[] | select(.body|contains("Provider Comparison Report"))] | last | .body' 2>/dev/null)
  if [ -z "$body" ] || [ "$body" = "null" ]; then
    echo "    no Provider Comparison Report posted"
  else
    printf '%s' "$body" | grep -E "^\|" | head -6 | sed 's/^/    /'
  fi

  # did eval-auto-followup act?
  labels=$(gh pr view "$pr" --repo "$REPO" --json labels -q '[.labels[].name]|join(",")' 2>/dev/null)
  case "$labels" in
    *verify:create-new-pr*) echo "    -> follow-up REQUESTED" ;;
    *) echo "    -> no follow-up requested" ;;
  esac
  echo
done
