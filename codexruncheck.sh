#!/usr/bin/env bash
# Did the Codex CLI ever actually get dispatched? Read-only.
REPO="${REPO:-iamkayleb/bukay}"

echo "═══ 1. Gate Followups runs (this is what dispatches run-codex) ═══"
gh run list --repo "$REPO" --workflow=agents-81-gate-followups.yml --limit 8 \
  --json databaseId,createdAt,conclusion,status \
  -q '.[] | "  \(.databaseId)  \(.createdAt[5:16])  \((.conclusion // .status))"'

echo
echo "═══ 2. Which agent jobs ran in the most recent one? ═══"
RUN=$(gh run list --repo "$REPO" --workflow=agents-81-gate-followups.yml --limit 1 \
      --json databaseId -q '.[0].databaseId')
echo "  run: $RUN"
gh run view "$RUN" --repo "$REPO" --json jobs \
  -q '.jobs[] | select(.name|test("run-|Keepalive next task|autofix")) | "  \(.conclusion // .status)  \(.name)"' \
  2>/dev/null || echo "  (no agent jobs in that run)"

echo
echo "═══ 3. Compare: how many times has each agent's runner actually executed? ═══"
for a in codex claude cursor; do
  n=$(gh run list --repo "$REPO" --limit 100 --json name \
      -q "[.[] | select(.name|test(\"[Rr]eusable $a|$a run\";\"i\"))] | length" 2>/dev/null)
  printf "  reusable-%s-run invocations in last 100 runs: %s\n" "$a" "${n:-0}"
done

echo
echo "═══ 4. All distinct workflow names seen recently ═══"
gh run list --repo "$REPO" --limit 100 --json name -q '[.[].name] | unique | .[]' 2>/dev/null \
  | sed 's/^/  /'
