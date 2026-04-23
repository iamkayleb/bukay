from __future__ import annotations

import unittest
from pathlib import Path
from unittest.mock import patch

from tools.ci_failure_triage import (
    CI_FAILING_PLAYBOOK_URL,
    DEFAULT_TRIAGE_PATTERNS,
    TriageFinding,
    TriageReport,
    _format_text_report,
    _parse_llm_findings,
    extract_pytest_failures,
    triage_ci_failure,
)


class TriagePatternTests(unittest.TestCase):
    def test_default_triage_patterns_reference_existing_docs(self) -> None:
        repo_root = Path(__file__).resolve().parents[1]

        for pattern in DEFAULT_TRIAGE_PATTERNS:
            if pattern.playbook_url is None:
                continue
            doc_path = pattern.playbook_url.split("#", 1)[0]
            self.assertTrue((repo_root / doc_path).is_file(), pattern.playbook_url)

    def test_triage_ci_failure_uses_repo_local_playbook_url(self) -> None:
        log_text = """
        ============================= FAILURES =============================
        FAILED tests/test_widget.py::test_render - AssertionError: boom
        tests/test_widget.py:12: AssertionError
        """.strip()

        report = triage_ci_failure(log_text)

        self.assertEqual(report.summary, "Detected failure types: pytest. Pytest failures: 1.")
        self.assertEqual(report.failed_tests, ["tests/test_widget.py::test_render"])
        self.assertEqual(len(report.findings), 1)
        self.assertEqual(report.findings[0].playbook_url, "docs/CI_SYSTEM_GUIDE.md#ci-is-failing")

    def test_triage_ci_failure_detects_multiple_failure_types(self) -> None:
        log_text = """
        mypy src/widget.py
        src/widget.py:14: error: Incompatible return value type  [return-value]
        Found 1 error in 1 file
        Traceback (most recent call last):
          File "src/worker.py", line 3, in <module>
            import missing_package
        ModuleNotFoundError: No module named 'missing_package'
        SyntaxError: invalid syntax
        File "src/broken.py", line 7
        coverage failure: required test coverage of 90% not reached. Total coverage: 84.00%
        """.strip()

        report = triage_ci_failure(log_text, use_llm=False)

        self.assertEqual(
            [finding.error_type for finding in report.findings],
            ["mypy", "coverage", "import_error", "syntax_error"],
        )
        self.assertEqual(report.summary, "Detected failure types: mypy, coverage, import_error, syntax_error.")
        self.assertEqual(report.findings[0].relevant_files, ["src/widget.py"])
        self.assertEqual(report.findings[0].playbook_url, CI_FAILING_PLAYBOOK_URL)
        self.assertEqual(report.findings[2].relevant_files, ["src/worker.py"])
        self.assertEqual(report.findings[3].relevant_files, ["src/broken.py"])

    def test_extract_pytest_failures_deduplicates_failure_ids(self) -> None:
        log_text = """
        FAILED tests/test_widget.py::test_render - AssertionError: boom
        FAILED tests/test_widget.py::test_render - AssertionError: boom
        FAILED tests/test_api.py::test_index[param] - ValueError: bad
        """.strip()

        self.assertEqual(
            extract_pytest_failures(log_text),
            ["tests/test_widget.py::test_render", "tests/test_api.py::test_index[param]"],
        )

    def test_format_text_report_lists_failures_without_known_pattern(self) -> None:
        report = TriageReport(
            findings=[],
            summary="Detected failing tests without a known failure pattern.",
            failed_tests=["tests/test_widget.py::test_render"],
        )

        self.assertEqual(
            _format_text_report(report),
            "Detected failing tests without a known failure pattern.\n"
            "Failing tests:\n"
            "- tests/test_widget.py::test_render",
        )

    def test_parse_llm_findings_ignores_invalid_entries_and_code_fences(self) -> None:
        response = """
        ```json
        {
          "findings": [
            {
              "error_type": "flake8",
              "root_cause": "Style checks failed.",
              "suggested_fix": "Run the formatter.",
              "relevant_files": ["src/widget.py", "  ", 7],
              "playbook_url": "docs/CI_SYSTEM_GUIDE.md#ci-is-failing"
            },
            {
              "error_type": "",
              "root_cause": "missing type",
              "suggested_fix": "skip"
            }
          ]
        }
        ```
        """.strip()

        self.assertEqual(
            _parse_llm_findings(response),
            [
                TriageFinding(
                    error_type="flake8",
                    root_cause="Style checks failed.",
                    suggested_fix="Run the formatter.",
                    relevant_files=["src/widget.py"],
                    playbook_url=CI_FAILING_PLAYBOOK_URL,
                )
            ],
        )

    def test_triage_ci_failure_merges_distinct_llm_findings(self) -> None:
        llm_findings = [
            TriageFinding(
                error_type="ruff",
                root_cause="Linting failed.",
                suggested_fix="Fix the reported lint errors.",
                relevant_files=["src/widget.py"],
                playbook_url=CI_FAILING_PLAYBOOK_URL,
            ),
            TriageFinding(
                error_type="pytest",
                root_cause="Duplicate pytest finding from LLM.",
                suggested_fix="Should be ignored.",
                relevant_files=["tests/test_widget.py"],
                playbook_url=CI_FAILING_PLAYBOOK_URL,
            ),
        ]
        log_text = """
        ============================= FAILURES =============================
        FAILED tests/test_widget.py::test_render - AssertionError: boom
        tests/test_widget.py:12: AssertionError
        """.strip()

        with patch("tools.ci_failure_triage._run_llm_triage", return_value=llm_findings):
            report = triage_ci_failure(log_text, use_llm=True)

        self.assertEqual(
            [finding.error_type for finding in report.findings],
            ["pytest", "ruff"],
        )
        self.assertEqual(report.summary, "Detected failure types: pytest, ruff. Pytest failures: 1.")

    def test_triage_ci_failure_returns_unknown_summary_for_unmatched_failed_tests(self) -> None:
        log_text = "FAILED tests/test_widget.py::test_render - custom failure output"

        report = triage_ci_failure(log_text, use_llm=False)

        self.assertEqual(report.findings, [])
        self.assertEqual(report.failed_tests, ["tests/test_widget.py::test_render"])
        self.assertEqual(report.summary, "Detected failing tests without a known failure pattern.")


if __name__ == "__main__":
    unittest.main()
