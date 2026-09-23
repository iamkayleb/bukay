#!/usr/bin/env bash
# Force re-verification of merged eval PRs by clearing the stored state
# fingerprint, then re-applying verify:compare.
#
#   ./force-verify.sh                 # DRY RUN, all merged eval PRs
#   ./force-verify.sh --apply
#   ./force-verify.sh --apply 300 301 # specific PRs
set -uo pipefail
REPO="${REPO:-iamkayleb/bukay}"
APPLY=0; [ "${1:-}" = "--apply" ] && { APPLY=1; shift; }
run(){ if [ "$APPLY" -eq 1 ]; then eval "$@"; else echo "      would: $*"; fi; }

if [ $# -gt 0 ]; then PRS=("$@"); else
  mapfile -t PRS < <(gh pr list --repo "$REPO" --state merged --limit 30 \
    --json number,baseRefName -q '.[] | select(.baseRefName|startswith("eval/")) | .number')
fi
echo "repo=$REPO  mode=$([ $APPLY -eq 1 ] && echo APPLY || echo DRY-RUN)"
echo "PRs: ${PRS[*]}"
echo

for pr in "${PRS[@]}"; do
  echo "── PR #$pr"
  # The verifier stores its fingerprint in a PR comment marked
  #   <!-- fingerprint:<workflow name>:v1 {...} -->
  ids=$(gh api "repos/$REPO/issues/$pr/comments" --paginate \
        -q '.[] | select(.body|test("<!--\\s*fingerprint:")) | .id' 2>/dev/null)
  if [ -z "$ids" ]; then
    echo "    no fingerprint comment (nothing cached)"
  else
    for id in $ids; do
      echo "    delete fingerprint comment $id"
      run "gh api -X DELETE repos/$REPO/issues/comments/$id --silent"
    done
  fi
  echo "    re-apply verify:compare"
  run "gh pr edit $pr --repo $REPO --remove-label 'verify:compare' 2>/dev/null || true"
  run "sleep 3"
  run "gh pr edit $pr --repo $REPO --add-label 'verify:compare'"
  [ "$APPLY" -eq 1 ] && sleep 5
done

echo
[ "$APPLY" -eq 1 ] && echo "Watch: gh run list --repo $REPO --workflow=agents-verifier.yml --limit 6" \
                   || echo "DRY RUN — nothing changed. Re-run with --apply."
