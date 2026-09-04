#!/usr/bin/env bash
# Preflight for the three-lane evaluation. Read-only: checks, never changes.
#   gh auth login && ./eval-preflight.sh
REPO="${1:-iamkayleb/bukay}"
WF_REPO="${2:-iamkayleb/Workflows}"
fail=0
ok(){ printf '  \033[32m OK \033[0m %s\n' "$1"; }
no(){ printf '  \033[31mMISS\033[0m %s\n' "$1"; fail=$((fail+1)); }

echo "=== Eval lanes ($REPO) ==="
for b in eval/claude eval/codex eval/cursor; do
  gh api "repos/$REPO/branches/${b//\//%2F}" -q .name >/dev/null 2>&1 \
    && ok "branch $b" || no "branch $b  →  git checkout main && git checkout -b $b && git push -u origin $b"
done

echo "=== Labels ==="
labels=$(gh label list --repo "$REPO" --limit 200 --json name -q '.[].name' 2>/dev/null)
for l in agent:claude agent:codex agent:cursor agents:auto-pilot automerge \
         verify:compare verify:create-new-pr needs-human agents:paused capability:override; do
  grep -qxF "$l" <<<"$labels" && ok "label $l" || no "label $l  →  gh label create '$l' --repo $REPO"
done

echo "=== Repo variables ==="
v=$(gh api "repos/$REPO/actions/variables/USE_CONSOLIDATED_WORKFLOWS" -q .value 2>/dev/null)
[ "$v" = "true" ] && ok "USE_CONSOLIDATED_WORKFLOWS=true" \
  || no "USE_CONSOLIDATED_WORKFLOWS is '${v:-unset}' (gates 4 core workflows; must be 'true')"

echo "=== Secrets present ($REPO) ==="
secrets=$(gh secret list --repo "$REPO" --json name -q '.[].name' 2>/dev/null)
for s in WORKFLOWS_APP_ID WORKFLOWS_APP_PRIVATE_KEY CLAUDE_CODE_OAUTH_TOKEN \
         CODEX_AUTH_JSON CURSOR_API_KEY OPENAI_API_KEY; do
  grep -qxF "$s" <<<"$secrets" && ok "secret $s" || no "secret $s"
done

echo "=== Round specs on default branch ==="
n=$(gh api "repos/$REPO/contents/eval/rounds" -q '[.[]|select(.name|endswith(".json"))]|length' 2>/dev/null)
[ "${n:-0}" -gt 0 ] && ok "$n round spec file(s)" || no "eval/rounds/*.json not on default branch — merge eval/round-specs"

echo "=== Workflows present ==="
for w in eval-seed-issues.yml eval-lane-automation.yml eval-auto-followup.yml \
         agents-81-gate-followups.yml agents-issue-intake.yml; do
  gh api "repos/$REPO/contents/.github/workflows/$w" -q .name >/dev/null 2>&1 \
    && ok "$w" || no "$w"
done

echo "=== Cursor wired into the loop ==="
gh api "repos/$REPO/contents/.github/workflows/agents-81-gate-followups.yml" \
  -q .content 2>/dev/null | base64 -d 2>/dev/null | grep -q "run-cursor" \
  && ok "run-cursor job present" || no "run-cursor missing — merge + sync the Workflows cursor branch"

echo
[ "$fail" -eq 0 ] && echo "✅ Preflight clean — safe to seed round 1." \
  || echo "❌ $fail item(s) outstanding. Fix these before seeding."
exit $((fail>0))
