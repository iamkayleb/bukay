#!/usr/bin/env bash
# Show what the Codex CLI actually did on the most recent belt-worker run.
REPO="${REPO:-iamkayleb/bukay}"

echo "═══ recent Codex belt worker runs ═══"
gh run list --repo "$REPO" --workflow=agents-72-codex-belt-worker-dispatch.yml --limit 6 \
  --json databaseId,createdAt,conclusion,status,url \
  -q '.[] | "  \(.databaseId)  \(.createdAt[5:16])  \((.conclusion // .status))"'

RUN=$(gh run list --repo "$REPO" --workflow=agents-72-codex-belt-worker-dispatch.yml \
      --limit 1 --json databaseId -q '.[0].databaseId')
echo
echo "═══ steps in run $RUN ═══"
gh run view "$RUN" --repo "$REPO" --json jobs \
  -q '.jobs[] | "  JOB \(.name) [\(.conclusion)]", (.steps[] | "      \(.conclusion // .status)  \(.name)")' \
  2>/dev/null | head -40

echo
echo "═══ Codex CLI output from that run ═══"
gh run view "$RUN" --repo "$REPO" --log 2>/dev/null \
  | grep -iE "codex exec|codex-cli|Running Codex|codex session|changes-made|no changes|tokens used|reasoning|sandbox|bubblewrap|--model|gpt-|stream error|usage limit|Rate limit|refusal|exit code [1-9]" \
  | grep -viE "GITHUB_TOKEN|create-github-app-token|token_value|token_source|GH_BELT" \
  | head -40 | sed 's/^/    /'
echo "  (empty = the CLI produced no recognisable output in this run)"
