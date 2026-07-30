"""Checks that package.json stays scoped to this PR's acceptance criteria."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PACKAGE_JSON = ROOT / "package.json"


def _package_json() -> dict[str, object]:
    return json.loads(PACKAGE_JSON.read_text())


def test_package_json_does_not_keep_unrelated_lighthouse_script() -> None:
    package = _package_json()
    scripts = package.get("scripts", {})

    assert isinstance(scripts, dict)
    assert "lighthouse:mobile" not in scripts


def test_package_json_does_not_add_playwright_dependency() -> None:
    package = _package_json()
    dependencies = package.get("dependencies", {})

    assert isinstance(dependencies, dict)
    assert "@playwright/test" not in dependencies
