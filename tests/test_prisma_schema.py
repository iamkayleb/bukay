"""Static checks on prisma/schema.prisma.

These guard the multi-tenant invariant from the data-model PR:
every tenant-owned model must carry a `tenantId` column AND declare
`@@index([tenantId])`. Run as part of normal pytest; no DB required.
"""

from __future__ import annotations

import re
from pathlib import Path

SCHEMA_PATH = Path(__file__).resolve().parent.parent / "prisma" / "schema.prisma"

# Models scoped to a tenant (everything except Tenant itself).
TENANT_SCOPED_MODELS = {
    "User",
    "Service",
    "Staff",
    "BusinessHour",
    "Blackout",
    "Client",
    "Booking",
    "Payment",
    "AuditLog",
}

# Models the scope requires to exist at all.
REQUIRED_MODELS = TENANT_SCOPED_MODELS | {"Tenant"}


def _model_blocks(schema_text: str) -> dict[str, str]:
    """Return a {model_name: body_text} map from a Prisma schema."""
    blocks: dict[str, str] = {}
    pattern = re.compile(r"^model\s+(\w+)\s*\{([^}]*)\}", re.MULTILINE | re.DOTALL)
    for match in pattern.finditer(schema_text):
        blocks[match.group(1)] = match.group(2)
    return blocks


def test_schema_file_exists() -> None:
    assert SCHEMA_PATH.exists(), f"missing prisma schema at {SCHEMA_PATH}"


def test_all_required_models_present() -> None:
    blocks = _model_blocks(SCHEMA_PATH.read_text())
    missing = REQUIRED_MODELS - blocks.keys()
    assert not missing, f"prisma schema missing required models: {sorted(missing)}"


def test_every_tenant_scoped_model_has_tenant_id_column() -> None:
    blocks = _model_blocks(SCHEMA_PATH.read_text())
    for name in TENANT_SCOPED_MODELS:
        body = blocks[name]
        assert re.search(
            r"^\s*tenantId\s+String\b", body, re.MULTILINE
        ), f"model {name} is missing a `tenantId String` column"


def test_every_tenant_scoped_model_has_tenant_index() -> None:
    blocks = _model_blocks(SCHEMA_PATH.read_text())
    for name in TENANT_SCOPED_MODELS:
        body = blocks[name]
        assert "@@index([tenantId])" in body or re.search(
            r"@@index\(\[tenantId,", body
        ), f"model {name} is missing `@@index([tenantId])`"


def test_tenant_model_has_no_tenant_id() -> None:
    blocks = _model_blocks(SCHEMA_PATH.read_text())
    body = blocks["Tenant"]
    assert not re.search(
        r"^\s*tenantId\s+", body, re.MULTILINE
    ), "Tenant model must not carry its own tenantId column"


def test_business_hour_supports_multiple_windows_per_weekday() -> None:
    body = _model_blocks(SCHEMA_PATH.read_text())["BusinessHour"]
    assert "@@unique([tenantId, dayOfWeek])" not in body
    assert "@@index([tenantId, dayOfWeek])" in body
    assert "@@unique([tenantId, dayOfWeek, opensAt, closesAt])" in body


def test_blackout_is_date_specific_per_tenant() -> None:
    body = _model_blocks(SCHEMA_PATH.read_text())["Blackout"]
    assert re.search(r"^\s*date\s+String\b", body, re.MULTILINE)
    assert "@@unique([tenantId, date])" in body
    assert "@@index([tenantId, date])" in body
