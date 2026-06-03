"""Smoke tests for the tools package."""

from tools import __all__


def test_tools_exports() -> None:
    assert "post_ci_summary" in __all__
