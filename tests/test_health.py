import pytest

from bukay.health import HealthStatus, get_health


def test_get_health_returns_status() -> None:
    status = get_health("1.2.3")
    assert status == HealthStatus(ok=True, version="1.2.3")


def test_get_health_rejects_empty_version() -> None:
    with pytest.raises(ValueError, match="version must be non-empty"):
        get_health("")
