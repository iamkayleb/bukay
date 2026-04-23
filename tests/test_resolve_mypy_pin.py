from __future__ import annotations

import unittest
from unittest.mock import mock_open, patch

from tools import resolve_mypy_pin


class ResolveMypyPinTests(unittest.TestCase):
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
