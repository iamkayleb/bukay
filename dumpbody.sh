#!/usr/bin/env bash
# Dump and inspect the body of the paused round-6 issue. No arguments needed.
REPO="${REPO:-iamkayleb/bukay}"
ROUND="${1:-6}"

# newest open round-N issue that is paused
N=$(gh issue list --repo "$REPO" --label "eval:round-$ROUND" --state open --limit 50 \
      --json number,labels \
      -q '[.[] | select([.labels[].name] | index("agents:auto-pilot-pause"))] | .[0].number' 2>/dev/null)
# fall back to newest open round-N issue
[ -z "$N" ] || [ "$N" = "null" ] && N=$(gh issue list --repo "$REPO" --label "eval:round-$ROUND" \
      --state open --limit 50 --json number -q '.[0].number' 2>/dev/null)
[ -z "$N" ] || [ "$N" = "null" ] && { echo "no open eval:round-$ROUND issue found"; exit 1; }

echo "issue: #$N"
gh issue view "$N" --repo "$REPO" --json body -q .body > /tmp/body.md

echo
echo "--- structure (expect 6 headings in order + Original Issue) ---"
grep -nE "^## |<summary>Original Issue</summary>" /tmp/body.md

echo
echo "--- backticked path-like tokens ---"
grep -oE '`[^`]*/[^`]*`' /tmp/body.md | sort -u

echo
echo "--- markers ---"
grep -oE '<!-- eval-[a-z]+: [^ ]+ -->' /tmp/body.md

echo
echo "--- size ---"
wc -l /tmp/body.md

echo
echo "--- FULL BODY (paste everything below this line) ---"
cat /tmp/body.md
