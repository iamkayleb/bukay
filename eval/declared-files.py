#!/usr/bin/env python3
"""
List the files each round's specification declares, and whether each lane has them.

    python eval/declared-files.py                 # table, all rounds
    python eval/declared-files.py --round 11      # one round
    python eval/declared-files.py --csv > out.csv # spreadsheet
    python eval/declared-files.py --missing       # only what is absent somewhere

A path counts as "declared" when a task names it in backticks, it contains a
"/", and its last segment has an extension. That is the rule used for section 4
of REPORT.md.

What the rule does NOT catch, and why the numbers understate some lanes:

  * a task naming a DIRECTORY (`prisma/migrations/`) — 5 across the 15 rounds
  * a task naming a root-level file with no "/" (`package.json`) — 6, all in r01
  * work done under a DIFFERENT filename. Round 11 declared app/lib/reminders.ts;
    Claude built app/lib/reminder-settings.ts + app/lib/reminder-store.ts, which
    is the same capability and scores zero here.

So this measures conformance to the named paths, not capability. Use --missing
to see what to check by hand before quoting a total.

Reads the specs from eval/rounds/*.json in the working directory if present,
otherwise from the repo's default branch via `gh api`.
"""
import argparse, base64, json, re, subprocess, sys
from pathlib import Path

REPO = "iamkayleb/bukay"
LANES = ("claude", "codex", "cursor")

def gh(path):
    r = subprocess.run(["gh", "api", path], capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"gh api {path} failed:\n{r.stderr.strip()}")
    return json.loads(r.stdout)

def load_rounds():
    local = Path("eval/rounds")
    if local.is_dir():
        for f in sorted(local.glob("round-*.json")):
            yield json.loads(f.read_text())
        return
    for it in sorted(gh(f"repos/{REPO}/contents/eval/rounds?ref=main"), key=lambda x: x["name"]):
        if it["name"].endswith(".json"):
            yield json.loads(base64.b64decode(gh(
                f"repos/{REPO}/contents/eval/rounds/{it['name']}?ref=main")["content"]))

def lane_tree(lane):
    sha = gh(f"repos/{REPO}/branches/eval%2F{lane}")["commit"]["sha"]
    return {e["path"] for e in gh(f"repos/{REPO}/git/trees/{sha}?recursive=1")["tree"]}

def declared(spec):
    """Ordered, de-duplicated file paths this spec's tasks name."""
    out = []
    for task in spec["tasks"]:
        for tok in re.findall(r"`([^`]+)`", task):
            if "/" in tok and not tok.endswith("/") and "." in tok.rsplit("/", 1)[-1]:
                if tok not in out:
                    out.append(tok)
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--round", type=int, help="only this round")
    ap.add_argument("--csv", action="store_true", help="CSV instead of a table")
    ap.add_argument("--missing", action="store_true", help="only rows absent from some lane")
    ap.add_argument("--lanes", default=",".join(LANES))
    a = ap.parse_args()
    lanes = [l.strip() for l in a.lanes.split(",") if l.strip()]

    trees = {l: lane_tree(l) for l in lanes}
    rows, totals = [], {l: [0, 0] for l in lanes}

    for rd in load_rounds():
        if a.round and rd["round"] != a.round:
            continue
        for spec in rd["specs"]:
            for path in declared(spec):
                have = {l: path in trees[l] for l in lanes}
                for l in lanes:
                    totals[l][0] += have[l]
                    totals[l][1] += 1
                if a.missing and all(have.values()):
                    continue
                rows.append((rd["round"], spec["id"], path, have))

    if a.csv:
        import csv
        w = csv.writer(sys.stdout, lineterminator="\n")
        w.writerow(["round", "spec", "path"] + lanes)
        for r, s, p, h in rows:
            w.writerow([r, s, p] + [int(h[l]) for l in lanes])
        return

    w = max([len(p) for _, _, p, _ in rows] + [20])
    print(f"{'rd':<3} {'spec':<24} {'declared file':<{w}} " + " ".join(f"{l:^8}" for l in lanes))
    print("-" * (3 + 25 + w + 9 * len(lanes)))
    for r, s, p, h in rows:
        print(f"r{r:02d} {s:<24} {p:<{w}} " + " ".join(f"{'yes' if h[l] else '-':^8}" for l in lanes))
    print("-" * (3 + 25 + w + 9 * len(lanes)))
    if not a.round:
        print(f"{'':<3} {'TOTAL':<24} {'':<{w}} " +
              " ".join(f"{str(totals[l][0])+'/'+str(totals[l][1]):^8}" for l in lanes))

if __name__ == "__main__":
    main()
