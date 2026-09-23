#!/usr/bin/env bash
# Audit lane integrity across every open eval issue and PR.
#
#   ./eval/lane-audit.sh
#
# Checks four things that must agree, and reports every disagreement:
#
#   1. agent label       exactly one agent:<x> besides agent:auto
#   2. base marker       <!-- base-branch: eval/<x> --> in the issue/PR body
#   3. head prefix       PR head branch named <x>/...
#   4. PR base           PR targets eval/<x>
#
# A follow-up issue with no base marker is the failure that sends remediation
# to main; a PR whose head prefix disagrees with its agent label is the
# cross-lane contamination that rotation and a mis-resolved follow-up produce.
# Read-only: this writes nothing.
set -uo pipefail
REPO="${REPO:-iamkayleb/bukay}"
LANES="claude codex cursor"

lane_of_labels() {   # prints the single explicit agent, or '' / 'AMBIG'
  local names; names=$(printf '%s\n' "$1" | tr ' ' '\n' \
    | grep '^agent:' | sed 's/^agent://' | grep -v '^auto$' | sort -u)
  local n; n=$(printf '%s' "$names" | grep -c . )
  case "$n" in
    0) echo "" ;;
    1) echo "$names" ;;
    *) echo "AMBIG:$(echo $names | tr ' ' ',')" ;;
  esac
}

problems=0; checked=0

echo "=== OPEN ISSUES ==="
gh issue list --repo "$REPO" --state open --limit 300 \
  --json number,labels,body \
  -q '.[] | [.number, ([.labels[].name] | join(" ")), (.body | gsub("\n";" "))] | @tsv' \
| while IFS=$'\t' read -r num labels body; do
    case "$labels" in *agent:*) ;; *) continue ;; esac
    checked=$((checked+1))
    lane=$(lane_of_labels "$labels")
    marker=$(printf '%s' "$body" | grep -oE '<!-- base-branch: eval/[a-z]+ -->' \
             | head -1 | sed 's/.*eval\///; s/ -->//')
    msg=""
    case "$lane" in
      "")        msg="no explicit agent:* label" ;;
      AMBIG:*)   msg="multiple agent labels (${lane#AMBIG:})" ;;
    esac
    if [ -z "$marker" ]; then
      msg="${msg:+$msg; }no base-branch marker (will target the default branch)"
    elif [ -n "$lane" ] && [ "${lane#AMBIG:}" = "$lane" ] && [ "$marker" != "$lane" ]; then
      msg="${msg:+$msg; }marker says eval/$marker but label says $lane"
    fi
    if [ -n "$msg" ]; then
      echo "  ISSUE #$num  $msg"
    fi
  done

echo
echo "=== OPEN PRS ==="
gh pr list --repo "$REPO" --state open --limit 300 \
  --json number,labels,headRefName,baseRefName,isDraft \
  -q '.[] | [.number, ([.labels[].name] | join(" ")), .headRefName, .baseRefName, (.isDraft|tostring)] | @tsv' \
| while IFS=$'\t' read -r num labels head base draft; do
    case "$labels" in *agent:*) ;; *) continue ;; esac
    lane=$(lane_of_labels "$labels")
    prefix="${head%%/*}"
    msg=""
    case "$lane" in
      "")      msg="no explicit agent:* label" ;;
      AMBIG:*) msg="multiple agent labels (${lane#AMBIG:})" ;;
      *)
        [ "$prefix" != "$lane" ] && \
          msg="head is '$head' but label says $lane (cross-lane work)"
        [ "$base" != "eval/$lane" ] && \
          msg="${msg:+$msg; }base is '$base', expected eval/$lane"
        ;;
    esac
    [ "$draft" = "true" ] && msg="${msg:+$msg; }draft (automation PRs must be ready)"
    if [ -n "$msg" ]; then
      echo "  PR #$num  $msg"
    fi
  done

echo
echo "=== LANE BRANCHES CARRYING COMMITS FROM THE DEFAULT BRANCH ==="
echo "  (a merge of main baked into a lane branch cannot be undone by retargeting)"
default=$(gh repo view "$REPO" --json defaultBranchRef -q .defaultBranchRef.name)
git fetch -q --prune origin 2>/dev/null

# Scans every <agent>/issue-* branch, not only ones with an open PR: a poisoned
# branch whose PR was closed is still there to be reopened or re-pushed.
#
# NOTE: asking "is origin/<default> an ancestor of the head" is WRONG. main
# moves on after the bad merge, so a genuinely poisoned branch stops matching —
# that test missed bukay #372. Ask instead whether the branch carries any commit
# that <default> has and the branch's own lane base does not. That stays true
# however far <default> advances.
git for-each-ref --format='%(refname:short)' refs/remotes/origin \
  | grep -E '^origin/(claude|codex|cursor)/issue-' \
| while read -r ref; do
    head=${ref#origin/}
    lane="${head%%/*}"
    base="origin/eval/$lane"
    git rev-parse --verify -q "$base" >/dev/null || continue
    # Already fully merged into its lane: nothing pending, skip.
    [ "$(git rev-list --count "$base".."$ref")" = "0" ] && continue
    hits=$(comm -12 \
      <(git rev-list "$ref" --not "$base" | sort) \
      <(git rev-list "origin/$default" | sort) | grep -c .)
    if [ "$hits" -gt 0 ]; then
      files=$(git diff --name-only "$(git merge-base "$base" "$ref")" "$ref" | wc -l)
      echo "  $head  carries $hits commit(s) from $default that eval/$lane does not  (${files// /} files vs its lane)"
    fi
  done

echo
echo "Done. Nothing was modified."
