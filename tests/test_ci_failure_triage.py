from __future__ import annotations

from pathlib import Path
import unittest

from tools.ci_failure_triage import DEFAULT_TRIAGE_PATTERNS, triage_ci_failure


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


if __name__ == "__main__":
    unittest.main()
