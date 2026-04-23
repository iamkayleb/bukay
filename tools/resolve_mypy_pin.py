#!/usr/bin/env python3
"""Resolve which Python version should run mypy.

This script outputs a single Python version to GITHUB_OUTPUT to ensure mypy
only runs once per CI matrix (avoiding duplicate type-checking across Python
versions).

The script:
1. Reads the target Python version from pyproject.toml's [tool.mypy] section
2. Falls back to the first version in the CI matrix
3. Outputs the resolved version to GITHUB_OUTPUT for workflow use
"""

from __future__ import annotations

import os
import re
import sys
from collections.abc import Mapping
from pathlib import Path
from typing import cast


_MYPY_PYTHON_VERSION_PATTERN = re.compile(
    r'\[tool\.mypy\].*?python_version\s*=\s*["\']?(\d+\.\d+)["\']?',
    re.DOTALL,
)
_PYPROJECT_CANDIDATES = (
    Path("pyproject.toml"),
    Path(".workflows-lib/pyproject.toml"),
)


def _extract_mypy_version_from_text(content: str) -> str | None:
    """Extract python_version from TOML text without requiring a TOML parser."""
    match = _MYPY_PYTHON_VERSION_PATTERN.search(content)
    if match:
        return match.group(1)
    return None


def _as_str_object_mapping(value: object) -> Mapping[str, object]:
    """Normalize TOML table-like values to a string-keyed mapping."""
    if not isinstance(value, Mapping):
        return {}
    return cast(Mapping[str, object], value)


def get_mypy_python_version() -> str | None:
    """Extract python_version from pyproject.toml's [tool.mypy] section."""
    pyproject_path = next((path for path in _PYPROJECT_CANDIDATES if path.exists()), None)
    if pyproject_path is None:
        return None

    try:
        content = pyproject_path.read_text(encoding="utf-8")
    except OSError:
        return None

    try:
        # Try tomlkit first (more accurate TOML parsing)
        import tomlkit

        data = tomlkit.parse(content)
        tool = _as_str_object_mapping(data.get("tool"))
        mypy = _as_str_object_mapping(tool.get("mypy"))
        version = mypy.get("python_version")
        # Validate type before conversion - TOML can parse various types
        if isinstance(version, (str, int, float)):
            return str(version)
        return None
    except ImportError:
        return _extract_mypy_version_from_text(content)
    except Exception:
        return _extract_mypy_version_from_text(content)

    return _extract_mypy_version_from_text(content)


def main() -> int:
    """Determine and output the Python version for mypy."""
    # Get the current matrix Python version from environment
    matrix_version = os.environ.get("MATRIX_PYTHON_VERSION", "")

    # Get the mypy-configured Python version from pyproject.toml
    mypy_version = get_mypy_python_version()

    # Determine which version to output
    # If mypy has a configured version, use it; otherwise use matrix version
    output_version = mypy_version or matrix_version or "3.11"

    # Write to GITHUB_OUTPUT
    github_output = os.environ.get("GITHUB_OUTPUT")
    if github_output:
        try:
            with open(github_output, "a", encoding="utf-8") as f:
                f.write(f"python-version={output_version}\n")
        except OSError:
            print(f"python-version={output_version}")
        else:
            print(f"Resolved mypy Python version: {output_version}")
    else:
        # For local testing
        print(f"python-version={output_version}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
