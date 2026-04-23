from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import NamedTemporaryFile
from types import ModuleType, SimpleNamespace
from unittest.mock import patch

from tools.ci_failure_triage import (
    CI_FAILING_PLAYBOOK_URL,
    DEFAULT_TRIAGE_PATTERNS,
    SUGGESTED_FIX_TEMPLATES,
    TriageFinding,
    TriageReport,
    _bool_env,
    _build_llm_prompt,
    _extract_json_payload,
    _format_suggested_fix,
    _format_text_report,
    _get_llm_client,
    _parse_llm_findings,
    _read_log_text,
    _report_to_dict,
    _run_llm_triage,
    extract_pytest_failures,
    main,
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
        self.assertEqual(
            report.summary,
            "Detected failure types: mypy, coverage, import_error, syntax_error.",
        )
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
        self.assertEqual(
            report.summary,
            "Detected failure types: pytest, ruff. Pytest failures: 1.",
        )

    def test_triage_ci_failure_returns_unknown_summary_for_unmatched_failed_tests(self) -> None:
        log_text = "FAILED tests/test_widget.py::test_render - custom failure output"

        report = triage_ci_failure(log_text, use_llm=False)

        self.assertEqual(report.findings, [])
        self.assertEqual(report.failed_tests, ["tests/test_widget.py::test_render"])
        self.assertEqual(report.summary, "Detected failing tests without a known failure pattern.")

    def test_bool_env_recognizes_truthy_values(self) -> None:
        self.assertTrue(_bool_env(" true "))
        self.assertTrue(_bool_env("ON"))
        self.assertFalse(_bool_env("0"))
        self.assertFalse(_bool_env(None))

    def test_extract_json_payload_reads_embedded_json_object(self) -> None:
        payload = _extract_json_payload("prefix\n{\"findings\": []}\nsuffix")

        self.assertEqual(payload, "{\"findings\": []}")

    def test_build_llm_prompt_truncates_large_logs(self) -> None:
        prompt = _build_llm_prompt("x" * 9000)

        self.assertIn("return JSON only", prompt)
        self.assertTrue(prompt.endswith("x" * 8000))

    def test_format_text_report_includes_findings_and_playbook(self) -> None:
        report = TriageReport(
            summary="Detected failure types: pytest.",
            failed_tests=["tests/test_widget.py::test_render"],
            findings=[
                TriageFinding(
                    error_type="pytest",
                    root_cause="Pytest reported failing tests.",
                    suggested_fix="Inspect failing tests in tests/test_widget.py.",
                    relevant_files=["tests/test_widget.py"],
                    playbook_url=CI_FAILING_PLAYBOOK_URL,
                )
            ],
        )

        self.assertEqual(
            _format_text_report(report),
            "Detected failure types: pytest.\n"
            "Failing tests:\n"
            "- tests/test_widget.py::test_render\n"
            "- error_type: pytest\n"
            "  root_cause: Pytest reported failing tests.\n"
            "  suggested_fix: Inspect failing tests in tests/test_widget.py.\n"
            "  relevant_files: tests/test_widget.py\n"
            "  playbook_url: docs/CI_SYSTEM_GUIDE.md#ci-is-failing",
        )

    def test_format_suggested_fix_uses_fallback_when_no_files_exist(self) -> None:
        self.assertEqual(
            _format_suggested_fix(SUGGESTED_FIX_TEMPLATES["coverage"], []),
            "Add or expand tests covering the reported files to meet the coverage threshold.",
        )

    def test_read_log_text_reads_from_stdin_without_path(self) -> None:
        with patch("sys.stdin.read", return_value="stdin failure log") as stdin_read:
            self.assertEqual(_read_log_text(None), "stdin failure log")

        stdin_read.assert_called_once_with()

    def test_read_log_text_reads_utf8_file_contents(self) -> None:
        with NamedTemporaryFile("w+", encoding="utf-8") as log_file:
            log_file.write("file failure log")
            log_file.flush()

            self.assertEqual(_read_log_text(log_file.name), "file failure log")

    def test_run_llm_triage_returns_empty_list_when_client_invocation_fails(self) -> None:
        client = SimpleNamespace(invoke=lambda prompt: (_ for _ in ()).throw(RuntimeError("boom")))

        with patch("tools.ci_failure_triage._get_llm_client", return_value=(client, "openai")):
            self.assertEqual(_run_llm_triage("pytest failure"), [])

    def test_run_llm_triage_uses_stringified_response_without_content_attribute(self) -> None:
        class Response:
            def __str__(self) -> str:
                return '{"findings":[{"error_type":"ruff","root_cause":"lint","suggested_fix":"fix lint","relevant_files":["src/widget.py"]}]}'

        client = SimpleNamespace(invoke=lambda prompt: Response())

        with patch("tools.ci_failure_triage._get_llm_client", return_value=(client, "openai")):
            self.assertEqual(
                _run_llm_triage("ruff failure"),
                [
                    TriageFinding(
                        error_type="ruff",
                        root_cause="lint",
                        suggested_fix="fix lint",
                        relevant_files=["src/widget.py"],
                        playbook_url=None,
                    )
                ],
            )

    def test_get_llm_client_prefers_github_models_when_token_exists(self) -> None:
        fake_langchain_openai = ModuleType("langchain_openai")
        chat_openai = unittest.mock.MagicMock(name="ChatOpenAI")
        fake_langchain_openai.ChatOpenAI = chat_openai

        fake_llm_provider = ModuleType("tools.llm_provider")
        fake_llm_provider.DEFAULT_MODEL = "gpt-test"
        fake_llm_provider.GITHUB_MODELS_BASE_URL = "https://models.github.invalid"

        with patch.dict(
            "sys.modules",
            {
                "langchain_openai": fake_langchain_openai,
                "tools.llm_provider": fake_llm_provider,
            },
        ):
            with patch.dict(
                "os.environ",
                {"GITHUB_TOKEN": "github-token", "OPENAI_API_KEY": "openai-token"},
                clear=True,
            ):
                client_info = _get_llm_client()

        self.assertEqual(client_info, (chat_openai.return_value, "github-models"))
        chat_openai.assert_called_once_with(
            model="gpt-test",
            base_url="https://models.github.invalid",
            api_key="github-token",
            temperature=0.1,
        )

    def test_get_llm_client_uses_openai_when_only_openai_token_exists(self) -> None:
        fake_langchain_openai = ModuleType("langchain_openai")
        chat_openai = unittest.mock.MagicMock(name="ChatOpenAI")
        fake_langchain_openai.ChatOpenAI = chat_openai

        fake_llm_provider = ModuleType("tools.llm_provider")
        fake_llm_provider.DEFAULT_MODEL = "gpt-test"
        fake_llm_provider.GITHUB_MODELS_BASE_URL = "https://models.github.invalid"

        with patch.dict(
            "sys.modules",
            {
                "langchain_openai": fake_langchain_openai,
                "tools.llm_provider": fake_llm_provider,
            },
        ):
            with patch.dict("os.environ", {"OPENAI_API_KEY": "openai-token"}, clear=True):
                client_info = _get_llm_client()

        self.assertEqual(client_info, (chat_openai.return_value, "openai"))
        chat_openai.assert_called_once_with(
            model="gpt-test",
            api_key="openai-token",
            temperature=0.1,
        )

    def test_get_llm_client_returns_none_without_tokens(self) -> None:
        fake_langchain_openai = ModuleType("langchain_openai")
        fake_langchain_openai.ChatOpenAI = unittest.mock.MagicMock(name="ChatOpenAI")

        with patch.dict("sys.modules", {"langchain_openai": fake_langchain_openai}):
            with patch.dict("os.environ", {}, clear=True):
                self.assertIsNone(_get_llm_client())

    def test_report_to_dict_includes_evidence(self) -> None:
        report = TriageReport(
            summary="Detected failure types: pytest.",
            failed_tests=["tests/test_widget.py::test_render"],
            findings=[
                TriageFinding(
                    error_type="pytest",
                    root_cause="Pytest reported failing tests.",
                    suggested_fix="Inspect failing tests.",
                    relevant_files=["tests/test_widget.py"],
                    playbook_url=CI_FAILING_PLAYBOOK_URL,
                    evidence=["FAILED tests/test_widget.py::test_render - AssertionError: boom"],
                )
            ],
        )

        self.assertEqual(
            _report_to_dict(report),
            {
                "summary": "Detected failure types: pytest.",
                "failed_tests": ["tests/test_widget.py::test_render"],
                "findings": [
                    {
                        "error_type": "pytest",
                        "root_cause": "Pytest reported failing tests.",
                        "suggested_fix": "Inspect failing tests.",
                        "relevant_files": ["tests/test_widget.py"],
                        "playbook_url": CI_FAILING_PLAYBOOK_URL,
                        "evidence": [
                            "FAILED tests/test_widget.py::test_render - AssertionError: boom"
                        ],
                    }
                ],
            },
        )

    def test_main_passes_cli_llm_toggle_to_triage(self) -> None:
        with (
            NamedTemporaryFile("w+", encoding="utf-8") as log_file,
            patch("tools.ci_failure_triage.triage_ci_failure") as triage_mock,
            patch("sys.stdout") as stdout_mock,
        ):
            log_file.write("FAILED tests/test_widget.py::test_render - AssertionError: boom\n")
            log_file.flush()
            triage_mock.return_value = TriageReport(
                findings=[],
                summary="No known failure patterns.",
            )

            exit_code = main(["--log-file", log_file.name, "--no-llm"])

        self.assertEqual(exit_code, 0)
        triage_mock.assert_called_once_with(
            "FAILED tests/test_widget.py::test_render - AssertionError: boom\n",
            use_llm=False,
        )
        stdout_mock.write.assert_any_call("No known failure patterns.")

    def test_main_emits_json_output(self) -> None:
        with (
            NamedTemporaryFile("w+", encoding="utf-8") as log_file,
            patch("sys.stdout") as stdout_mock,
        ):
            log_file.write("FAILED tests/test_widget.py::test_render - AssertionError: boom\n")
            log_file.flush()

            exit_code = main(["--log-file", log_file.name, "--json", "--use-llm"])

        self.assertEqual(exit_code, 0)
        output = "".join(call.args[0] for call in stdout_mock.write.call_args_list)
        self.assertIn(
            '"summary": "Detected failing tests without a known failure pattern."',
            output,
        )
        self.assertIn('"failed_tests": [', output)


if __name__ == "__main__":
    unittest.main()
