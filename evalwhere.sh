#!/usr/bin/env bash
# Where is each evaluation issue actually stuck?
#
# Reads the ISSUE TIMELINE, not the run list. auto-pilot sets no run-name, so
# `gh run list` cannot be correlated to an issue at all; its own comments on the
# issue are the only reliable per-issue record of what it did and why it stopped.
#
#   ./eval-where.sh          # all round-1 issues
#   ./eval-where.sh 244      # one issue, with full last comment
set -uo pipefail
REPO="${REPO:-iamkayleb/bukay}"
ROUND="${ROUND:-1}"

if [ $# -gt 0 ]; then ISSUES=("$@"); else
  mapfile -t ISSUES < <(gh issue list --repo "$REPO" --label "eval:round-$ROUND" \
    --state open --json number -q '.[].number' | sort -n)
fi
[ "${#ISSUES[@]}" -eq 0 ] && { echo "no issues"; exit 0; }
single=0; [ $# -eq 1 ] && single=1

for n in "${ISSUES[@]}"; do
  echo "══════════════════════════════════════════════════"
  echo "#$n  $(gh issue view "$n" --repo "$REPO" --json title -q .title)"
  echo "  labels: $(gh issue view "$n" --repo "$REPO" --json labels -q '[.labels[].name]|join(", ")')"
  echo
  echo "  --- last 5 bot comments (newest last) ---"
  gh issue view "$n" --repo "$REPO" --json comments \
    -q '.comments[-5:][] | "  [\(.createdAt[:16])] \(.author.login): \(.body|split("\n")[0])"' \
    2>/dev/null || echo "  (no comments)"
  if [ "$single" -eq 1 ]; then
    echo
    echo "  --- full text of the last comment ---"
    gh issue view "$n" --repo "$REPO" --json comments -q '.comments[-1].body' 2>/dev/null \
      | sed 's/^/  /'
  fi
  echo
done

echo "══════════════════════════════════════════════════"
echo "Recent auto-pilot runs (correlation needs the run-name fix merged):"
gh run list --repo "$REPO" --workflow=agents-auto-pilot.yml --limit 8 \
  --json displayTitle,conclusion,status,createdAt,url \
  -q '.[] | "  \(.createdAt[:16])  \((.conclusion // .status))  \(.displayTitle)  \(.url)"'
