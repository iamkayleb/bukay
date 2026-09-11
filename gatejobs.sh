#!/usr/bin/env bash
# Why didn't run-codex fire? Inspect the gate-followups runs properly.
REPO="${REPO:-iamkayleb/bukay}"

echo "═══ last COMPLETED gate-followups run: every job, including skipped ═══"
RUN=$(gh run list --repo "$REPO" --workflow=agents-81-gate-followups.yml --limit 20 \
      --json databaseId,conclusion -q '[.[] | select(.conclusion=="success" or .conclusion=="failure")][0].databaseId')
echo "  run: $RUN"
gh run view "$RUN" --repo "$REPO" --json jobs \
  -q '.jobs[] | "  \((.conclusion // .status)|.[0:8])  \(.name)"' 2>/dev/null

echo
echo "═══ what did the evaluate job decide? ═══"
gh run view "$RUN" --repo "$REPO" --log 2>/dev/null \
  | grep -oE '(agent_type|dispatch_should_run|action|should_run|reason)=[A-Za-z0-9_.:-]+' \
  | sort -u | sed 's/^/    /' | head -20
echo "  (these outputs gate which run-<agent> job fires)"

echo
echo "═══ cancellations: what is the concurrency group? ═══"
gh api "repos/$REPO/contents/.github/workflows/agents-81-gate-followups.yml" -q .content 2>/dev/null \
  | base64 -d 2>/dev/null | sed -n '/^concurrency:/,/^[a-z]/p' | head -6 | sed 's/^/    /'

echo
echo "═══ how many runs were cancelled recently? ═══"
gh run list --repo "$REPO" --workflow=agents-81-gate-followups.yml --limit 30 \
  --json conclusion -q '[.[].conclusion] | group_by(.) | map({k:.[0],n:length}) | .[] | "  \(.k // "in-progress"): \(.n)"'
