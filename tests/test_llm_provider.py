"""Regression tests for LLM provider failover."""

from tools.llm_provider import CompletionAnalysis, FallbackChainProvider, LLMProvider


class QuotaDepletedProvider(LLMProvider):
    """Provider double that models the evaluator's exhausted-credit response."""

    @property
    def name(self) -> str:
        return "openai"

    def is_available(self) -> bool:
        return True

    def analyze_completion(
        self,
        session_output: str,
        tasks: list[str],
        context: str | None = None,
        quality_context=None,
    ) -> CompletionAnalysis:
        raise RuntimeError("HTTP 429: credit_balance_exhausted")


class SuccessfulProvider(LLMProvider):
    @property
    def name(self) -> str:
        return "anthropic"

    def is_available(self) -> bool:
        return True

    def analyze_completion(
        self,
        session_output: str,
        tasks: list[str],
        context: str | None = None,
        quality_context=None,
    ) -> CompletionAnalysis:
        return CompletionAnalysis(
            completed_tasks=tasks,
            in_progress_tasks=[],
            blocked_tasks=[],
            confidence=1.0,
            reasoning="Fallback provider completed the evaluation.",
            provider_used=self.name,
        )


def test_fallback_chain_continues_after_credit_balance_exhausted() -> None:
    provider = FallbackChainProvider([QuotaDepletedProvider(), SuccessfulProvider()])

    result = provider.analyze_completion("completed evaluation", ["evaluate pull request"])

    assert result.provider_used == "anthropic"
    assert result.completed_tasks == ["evaluate pull request"]
