#!/usr/bin/env bash
# Why did verify:compare produce no verdict for a PR?
REPO="${REPO:-iamkayleb/bukay}"
PR="${1:?usage: verify-run.sh <pr>}"

echo "═══ is the secret present? ═══"
gh secret list --repo "$REPO" --json name -q '.[].name' 2>/dev/null \
  | grep -E "CLAUDE_API_STRANSKE|OPENAI_API_KEY" | sed 's/^/  present: /' \
  || echo "  (cannot list secrets — check Settings → Secrets)"

echo
echo "═══ current labels on PR #$PR ═══"
gh pr view "$PR" --repo "$REPO" --json labels,state,mergedAt \
  -q '"  state=\(.state) merged=\(.mergedAt // "no")", "  labels: " + ([.labels[].name]|join(", "))'

echo
echo "═══ verifier runs (most recent first) ═══"
gh run list --repo "$REPO" --workflow=agents-verifier.yml --limit 8 \
  --json databaseId,createdAt,conclusion,status,displayTitle \
  -q '.[] | "  \(.databaseId)  \(.createdAt[5:16])  \((.conclusion // .status))  \(.displayTitle)"'

RUN=$(gh run list --repo "$REPO" --workflow=agents-verifier.yml --limit 8 \
      --json databaseId -q '.[0].databaseId')
echo
echo "═══ steps in the newest verifier run ($RUN) ═══"
gh run view "$RUN" --repo "$REPO" --json jobs \
  -q '.jobs[] | "  JOB \(.name) [\(.conclusion // .status)]", (.steps[] | "      \(.conclusion // .status)  \(.name)")' \
  2>/dev/null | head -30

echo
echo "═══ what the run said about providers ═══"
gh run view "$RUN" --repo "$REPO" --log 2>/dev/null \
  | grep -iE "is not set|falling back|fall back|no provider|slot[0-9]|anthropic|compare will|skipping|::error|::warning" \
  | grep -viE 'echo "|^\s*#' | head -20 | sed 's/^/    /'
echo "  (empty = nothing provider-related logged)"
