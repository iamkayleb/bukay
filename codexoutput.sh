#!/usr/bin/env bash
# Download and print what Codex itself actually said.
REPO="${REPO:-iamkayleb/bukay}"
RUN="${1:-}"

if [ -z "$RUN" ]; then
  RUN=$(gh run list --repo "$REPO" --workflow=agents-81-gate-followups.yml --limit 20 \
        --json databaseId,conclusion -q '[.[] | select(.conclusion=="success")][0].databaseId')
fi
echo "run: $RUN"

echo
echo "═══ artifacts on this run ═══"
gh api "repos/$REPO/actions/runs/$RUN/artifacts" \
  -q '.artifacts[] | "  \(.name)  (\(.size_in_bytes) bytes)"' 2>/dev/null \
  || echo "  none"

OUT=/tmp/codex-artifacts
rm -rf "$OUT"; mkdir -p "$OUT"

echo
echo "═══ downloading Codex output ═══"
name=$(gh api "repos/$REPO/actions/runs/$RUN/artifacts" \
       -q '.artifacts[] | select(.name|test("codex.*output|output.*codex|codex.*session";"i")) | .name' \
       2>/dev/null | head -1)
if [ -z "$name" ]; then
  echo "  no codex-output artifact; downloading all"
  gh run download "$RUN" --repo "$REPO" --dir "$OUT" 2>/dev/null || echo "  download failed"
else
  echo "  artifact: $name"
  gh run download "$RUN" --repo "$REPO" --name "$name" --dir "$OUT" 2>/dev/null || echo "  download failed"
fi

echo
echo "═══ files retrieved ═══"
find "$OUT" -type f 2>/dev/null | sed 's/^/  /' | head -20

echo
echo "═══ CONTENT (this is what Codex said) ═══"
find "$OUT" -type f \( -name "*.txt" -o -name "*.log" -o -name "*.md" -o -name "*.json" \) 2>/dev/null \
  | head -3 | while read -r f; do
      echo "  ----- $(basename "$f") -----"
      head -c 4000 "$f" | sed 's/^/    /'
      echo
    done
