#!/usr/bin/env bash
# One-shot state snapshot. Read-only.
REPO="${REPO:-iamkayleb/bukay}"
echo "== sync landed? =="
n=$(gh api "repos/$REPO/contents/.github/workflows/agents-71-codex-belt-dispatcher.yml" \
     -q .content 2>/dev/null | base64 -d 2>/dev/null | grep -c "base-branch:")
[ "${n:-0}" -gt 0 ] && echo "  YES — bukay has the base-branch fix" \
                    || echo "  NO  — bukay still cuts branches from main"

echo; echo "== eval lanes =="
for b in eval/claude eval/codex eval/cursor; do
  gh api "repos/$REPO/branches/${b//\//%2F}" -q .name >/dev/null 2>&1 \
    && echo "  ok      $b" || echo "  MISSING $b"
done

echo; echo "== round-1 issues =="
gh issue list --repo "$REPO" --label "eval:round-1" --state all --limit 20 \
  --json number,state,labels \
  -q '.[] | "  #\(.number) \(.state)  \([.labels[].name]|map(select(startswith("agent:")))|join(","))  all=[\([.labels[].name]|join(","))]"' \
  | sort

echo; echo "== agent branches that exist =="
gh api "repos/$REPO/branches?per_page=100" -q '.[].name' 2>/dev/null \
  | grep -E "^(claude|codex|cursor)/issue-" | sed 's/^/  /' || echo "  none"

echo; echo "== Agent belt PRs, any state, newest first =="
gh pr list --repo "$REPO" --state all --limit 20 \
  --json number,state,title,headRefName,baseRefName \
  -q '.[] | select(.title|startswith("Agent belt")) | "  #\(.number) \(.state)  \(.title)  head=\(.headRefName) base=\(.baseRefName)"' \
  || echo "  none"

echo; echo "== last 5 belt dispatcher runs =="
gh run list --repo "$REPO" --workflow=agents-71-codex-belt-dispatcher.yml --limit 5 \
  --json createdAt,conclusion,status,url \
  -q '.[] | "  \(.createdAt[:16])  \((.conclusion // .status))  \(.url)"'
