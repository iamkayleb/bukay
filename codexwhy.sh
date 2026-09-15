#!/usr/bin/env bash
# Why did Codex produce no code? Read-only.
REPO="${REPO:-iamkayleb/bukay}"

echo "═══ 1. Has the auth check already flagged it? ═══"
gh issue list --repo "$REPO" --label "auth-expiring" --state open \
  --json number,title,createdAt -q '.[] | "  #\(.number) \(.createdAt[:10]) \(.title)"' 2>/dev/null \
  || echo "  (no auth-expiring label / none open)"
gh run list --repo "$REPO" --workflow=health-codex-auth-check.yml --limit 3 \
  --json createdAt,conclusion,url -q '.[] | "  \(.createdAt[:16]) \(.conclusion) \(.url)"' 2>/dev/null \
  || echo "  health-codex-auth-check not present in this repo yet"

echo
echo "═══ 2. The Codex runner's own log ═══"
RUN=$(gh run list --repo "$REPO" --workflow=agents-72-codex-belt-worker-dispatch.yml \
      --limit 10 --json databaseId,createdAt -q '.[0].databaseId' 2>/dev/null)
if [ -z "$RUN" ]; then
  RUN=$(gh run list --repo "$REPO" --limit 40 --json databaseId,name,createdAt \
        -q '[.[] | select(.name|test("[Cc]odex"))][0].databaseId' 2>/dev/null)
fi
echo "  run: ${RUN:-none found}"
if [ -n "$RUN" ]; then
  gh run view "$RUN" --repo "$REPO" --log 2>/dev/null \
    | grep -iE "auth|expired|401|403|unauthor|login|token|credential|rate limit|quota|not found: codex|command not found|exit code" \
    | head -25 | sed 's/^/    /'
  echo "  (empty above = no auth/credential error in this run)"
fi

echo
echo "═══ 3. Is the secret even set? ═══"
gh secret list --repo "$REPO" --json name -q '.[].name' 2>/dev/null \
  | grep -E "CODEX_AUTH_JSON|OPENAI_API_KEY" | sed 's/^/  present: /' \
  || echo "  cannot list secrets (needs admin) — check Settings → Secrets"
