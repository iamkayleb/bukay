#!/usr/bin/env bash
# Dump the Codex keepalive JOB only — its steps and the CLI's real output.
REPO="${REPO:-iamkayleb/bukay}"

RUN=$(gh run list --repo "$REPO" --workflow=agents-81-gate-followups.yml --limit 20 \
      --json databaseId,conclusion -q '[.[] | select(.conclusion=="success")][0].databaseId')
echo "run: $RUN"

JOB=$(gh run view "$RUN" --repo "$REPO" --json jobs \
      -q '.jobs[] | select(.name|test("Codex \\(keepalive\\)|Keepalive next task \\(Codex\\)")) | .databaseId' \
      2>/dev/null | head -1)
echo "codex job: ${JOB:-NOT FOUND}"
[ -z "$JOB" ] && { echo "no Codex keepalive job in that run"; exit 1; }

echo
echo "═══ steps in the Codex job ═══"
gh run view "$RUN" --repo "$REPO" --json jobs \
  -q ".jobs[] | select(.databaseId==$JOB) | .steps[] | \"  \((.conclusion // .status))  \(.name)\"" 2>/dev/null

echo
echo "═══ CLI-relevant output (job log only, no script source) ═══"
gh run view "$RUN" --repo "$REPO" --job "$JOB" --log 2>/dev/null \
  | grep -vE '^\s*$' \
  | grep -iE "codex (exec|run|cli)|::(error|warning|notice)::|auth\.json|CODEX_HOME|changes-made=|has-completions=|tokens? used|model=|Sandbox|No changes detected|nothing to commit|exit code" \
  | grep -viE 'echo "|printf |^\s*#|GITHUB_TOKEN|create-github-app-token' \
  | head -35 | sed 's/^/    /'

echo
echo "═══ did the job produce a commit? ═══"
gh run view "$RUN" --repo "$REPO" --job "$JOB" --log 2>/dev/null \
  | grep -iE "\[codex/issue-|nothing to commit|create mode|files? changed" | head -8 | sed 's/^/    /'
