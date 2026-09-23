#!/usr/bin/env bash
# What actually landed on main? Read-only.
cd "${1:-.}" || exit 1
echo "== current branch =="
git rev-parse --abbrev-ref HEAD

echo
echo "== last 6 commits on local main =="
git log --oneline --graph -6 main 2>/dev/null

echo
echo "== is local main ahead of origin/main? =="
git fetch -q origin 2>/dev/null
echo "  ahead:  $(git rev-list --count origin/main..main 2>/dev/null)"
echo "  behind: $(git rev-list --count main..origin/main 2>/dev/null)"

echo
echo "== did the merge get PUSHED? =="
if git merge-base --is-ancestor origin/eval/codex origin/main 2>/dev/null; then
  echo "  YES — eval/codex is now an ancestor of origin/main"
else
  echo "  NO — origin/main does not contain eval/codex (local only)"
fi

echo
echo "== merge commits on main in the last 10 =="
git log --merges --oneline -10 main 2>/dev/null

echo
echo "== files main gained from eval/codex =="
git diff --name-only origin/main~1 origin/main 2>/dev/null | head -20
