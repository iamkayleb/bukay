from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class HealthStatus:
    ok: bool
    version: str


def get_health(version: str) -> HealthStatus:
    if not version:
        raise ValueError("version must be non-empty")
    return HealthStatus(ok=True, version=version)
