"""Repository-level guards for generated build artifacts."""

from __future__ import annotations

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GITIGNORE_PATH = ROOT / ".gitignore"
TSCONFIG_BUILDINFO = "tsconfig.tsbuildinfo"


def test_tsconfig_buildinfo_is_ignored() -> None:
    gitignore_lines = GITIGNORE_PATH.read_text().splitlines()
    assert (
        TSCONFIG_BUILDINFO in gitignore_lines
    ), f"{TSCONFIG_BUILDINFO} must be listed in .gitignore"


def test_tsconfig_buildinfo_is_not_tracked() -> None:
    result = subprocess.run(
        ["git", "ls-files", TSCONFIG_BUILDINFO],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "", f"{TSCONFIG_BUILDINFO} must not be tracked"
