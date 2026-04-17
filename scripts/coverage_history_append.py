#!/usr/bin/env python3
"""Append a coverage trend record to the NDJSON history file.

Reads RECORD_PATH (JSON) and appends it as a single line to HISTORY_PATH
(newline-delimited JSON). Both paths are resolved from environment variables.

Usage (invoked by CI):
    RECORD_PATH=coverage-trend.json HISTORY_PATH=coverage-trend-history.ndjson \
        python scripts/coverage_history_append.py
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path


def main() -> int:
    record_path = Path(os.environ.get("RECORD_PATH", "coverage-trend.json"))
    history_path = Path(os.environ.get("HISTORY_PATH", "coverage-trend-history.ndjson"))

    if not record_path.exists():
        print(f"Record file not found: {record_path}", file=sys.stderr)
        return 1

    try:
        record = json.loads(record_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"Failed to parse {record_path}: {exc}", file=sys.stderr)
        return 1

    history_path.parent.mkdir(parents=True, exist_ok=True)
    with history_path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record) + "\n")

    print(f"Appended record to {history_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
