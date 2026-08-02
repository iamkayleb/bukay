"""Repository hygiene checks for TypeScript build artifacts."""

from __future__ import annotations

import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def test_root_tsbuildinfo_artifact_is_ignored() -> None:
    gitignore = (REPO_ROOT / ".gitignore").read_text()

    assert "tsconfig.tsbuildinfo" in gitignore.splitlines()


def test_typescript_build_info_is_written_to_next_cache() -> None:
    tsconfig = json.loads((REPO_ROOT / "tsconfig.json").read_text())

    assert tsconfig["compilerOptions"]["tsBuildInfoFile"] == ".next/cache/tsconfig.tsbuildinfo"
