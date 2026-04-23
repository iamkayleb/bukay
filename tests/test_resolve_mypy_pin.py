from __future__ import annotations

import io
import unittest
from unittest.mock import mock_open, patch

from tools import resolve_mypy_pin


class ResolveMypyPinTests(unittest.TestCase):
    def test_get_mypy_python_version_reads_workflows_lib_pyproject_when_root_is_missing(self) -> None:
        pyproject = """
        [tool.mypy]
        python_version = "3.12"
        """.strip()

        def exists_side_effect(self: object) -> bool:
            return str(self) == ".workflows-lib/pyproject.toml"

        with (
            patch("tools.resolve_mypy_pin.Path.exists", autospec=True, side_effect=exists_side_effect),
            patch("tools.resolve_mypy_pin.Path.read_text", return_value=pyproject),
            patch.dict("sys.modules", {"tomlkit": None}),
        ):
            self.assertEqual(resolve_mypy_pin.get_mypy_python_version(), "3.12")

    def test_get_mypy_python_version_uses_regex_fallback_when_tomlkit_is_missing(self) -> None:
        pyproject = """
        [tool.mypy]
        python_version = "3.11"
        """.strip()

        with (
            patch("tools.resolve_mypy_pin.Path.exists", return_value=True),
            patch("tools.resolve_mypy_pin.Path.read_text", return_value=pyproject),
            patch.dict("sys.modules", {"tomlkit": None}),
        ):
            self.assertEqual(resolve_mypy_pin.get_mypy_python_version(), "3.11")

    def test_get_mypy_python_version_falls_back_when_tomlkit_parse_fails(self) -> None:
        pyproject = """
        [tool.mypy]
        python_version = "3.12"
        """.strip()

        tomlkit_stub = type(
            "TomlkitStub",
            (),
            {"parse": staticmethod(lambda _: (_ for _ in ()).throw(ValueError("bad toml")))},
        )

        with (
            patch("tools.resolve_mypy_pin.Path.exists", return_value=True),
            patch("tools.resolve_mypy_pin.Path.read_text", return_value=pyproject),
            patch.dict("sys.modules", {"tomlkit": tomlkit_stub}),
        ):
            self.assertEqual(resolve_mypy_pin.get_mypy_python_version(), "3.12")

    def test_get_mypy_python_version_returns_none_when_pyproject_cannot_be_read(self) -> None:
        with (
            patch("tools.resolve_mypy_pin.Path.exists", return_value=True),
            patch("tools.resolve_mypy_pin.Path.read_text", side_effect=OSError("denied")),
        ):
            self.assertIsNone(resolve_mypy_pin.get_mypy_python_version())

    def test_main_defaults_to_primary_python_when_env_and_pyproject_are_missing(self) -> None:
        stdout = io.StringIO()

        with (
            patch.dict("os.environ", {}, clear=True),
            patch("sys.stdout", stdout),
            patch("tools.resolve_mypy_pin.get_mypy_python_version", return_value=None),
        ):
            exit_code = resolve_mypy_pin.main()

        self.assertEqual(exit_code, 0)
        self.assertEqual(stdout.getvalue().strip(), "python-version=3.11")

    def test_main_falls_back_to_stdout_when_github_output_is_unwritable(self) -> None:
        with (
            patch.dict(
                "os.environ",
                {"GITHUB_OUTPUT": "/tmp/blocked-output", "MATRIX_PYTHON_VERSION": "3.12"},
                clear=False,
            ),
            patch("builtins.open", mock_open()) as open_mock,
            patch("builtins.print") as print_mock,
            patch("tools.resolve_mypy_pin.get_mypy_python_version", return_value=None),
        ):
            open_mock.side_effect = PermissionError("denied")

            exit_code = resolve_mypy_pin.main()

        self.assertEqual(exit_code, 0)
        print_mock.assert_called_with("python-version=3.12")


if __name__ == "__main__":
    unittest.main()
