#!/usr/bin/env bash
# Why is the agent run being skipped for a given PR?
REPO="${REPO:-iamkayleb/bukay}"
PR="${1:?usage: why-skipped.sh <pr-number>}"

echo "═══ gate-followups runs for PR #$PR ═══"
gh run list --repo "$REPO" --workflow=agents-81-gate-followups.yml --limit 40 \
  --json databaseId,displayTitle,createdAt,conclusion,status \
  -q ".[] | select(.displayTitle|contains(\"$PR\")) | \"  \(.databaseId)  \(.createdAt[5:16])  \((.conclusion // .status))\"" \
  | head -6
RUN=$(gh run list --repo "$REPO" --workflow=agents-81-gate-followups.yml --limit 40 \
      --json databaseId,displayTitle,conclusion \
      -q "[.[] | select(.displayTitle|contains(\"$PR\")) | select(.conclusion==\"success\")][0].databaseId")
[ -z "$RUN" ] && RUN=$(gh run list --repo "$REPO" --workflow=agents-81-gate-followups.yml --limit 10 \
      --json databaseId,conclusion -q '[.[]|select(.conclusion=="success")][0].databaseId')
echo "  inspecting run: $RUN"

echo
echo "═══ jobs (is the Cursor keepalive job even there?) ═══"
gh run view "$RUN" --repo "$REPO" --json jobs \
  -q '.jobs[] | select(.name|test("Keepalive|Evaluate|Mark agent")) | "  \((.conclusion // .status))  \(.name)"'

echo
echo "═══ the evaluate job's decision (executed lines only) ═══"
JOB=$(gh run view "$RUN" --repo "$REPO" --json jobs \
      -q '.jobs[] | select(.name|test("Evaluate keepalive")) | .databaseId' | head -1)
if [ -n "$JOB" ]; then
  gh run view "$RUN" --repo "$REPO" --job "$JOB" --log 2>/dev/null \
    | grep -oE '(should_dispatch|dispatch_should_run|agent_type|action|reason|skip_reason)"?[:=] ?"?[A-Za-z0-9_.:-]+' \
    | sort -u | sed 's/^/    /' | head -20
else
  echo "  (no Evaluate job found)"
fi

echo
echo "═══ has the head SHA changed since the last completed run? ═══"
gh pr view "$PR" --repo "$REPO" --json headRefOid,headRefName,baseRefName \
  -q '"  head=\(.headRefName) sha=\(.headRefOid[0:8]) base=\(.baseRefName)"'
