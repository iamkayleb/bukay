"""Static checks on prisma/schema.prisma.

These guard the multi-tenant invariant from the data-model PR:
every tenant-owned model must carry a `tenantId` column AND declare
`@@index([tenantId])`. Run as part of normal pytest; no DB required.
"""

from __future__ import annotations

import re
from pathlib import Path

SCHEMA_PATH = Path(__file__).resolve().parent.parent / "prisma" / "schema.prisma"

EXPECTED_TENANT_SCOPED_MODELS = {
    "User",
    "Service",
    "Staff",
    "StaffService",
    "BusinessHour",
    "Blackout",
    "Client",
    "Booking",
    "Payment",
    "AuditLog",
}

# Models the scope requires to exist at all.
REQUIRED_MODELS = EXPECTED_TENANT_SCOPED_MODELS | {"Tenant"}


def _model_blocks(schema_text: str) -> dict[str, str]:
    """Return a {model_name: body_text} map from a Prisma schema."""
    blocks: dict[str, str] = {}
    pattern = re.compile(r"^model\s+(\w+)\s*\{([^}]*)\}", re.MULTILINE | re.DOTALL)
    for match in pattern.finditer(schema_text):
        blocks[match.group(1)] = match.group(2)
    return blocks


def _has_tenant_id_column(model_body: str) -> bool:
    return re.search(r"^\s*tenantId\s+String\b", model_body, re.MULTILINE) is not None


def _tenant_scoped_models(blocks: dict[str, str]) -> set[str]:
    return {name for name, body in blocks.items() if _has_tenant_id_column(body)}


def _has_tenant_id_index(model_body: str) -> bool:
    return re.search(r"@@index\(\[\s*tenantId\s*(?:,|\])", model_body) is not None


def test_schema_file_exists() -> None:
    assert SCHEMA_PATH.exists(), f"missing prisma schema at {SCHEMA_PATH}"


def test_all_required_models_present() -> None:
    blocks = _model_blocks(SCHEMA_PATH.read_text())
    missing = REQUIRED_MODELS - blocks.keys()
    assert not missing, f"prisma schema missing required models: {sorted(missing)}"


def test_expected_tenant_scoped_models_have_tenant_id_column() -> None:
    blocks = _model_blocks(SCHEMA_PATH.read_text())
    for name in EXPECTED_TENANT_SCOPED_MODELS:
        body = blocks[name]
        assert _has_tenant_id_column(body), f"model {name} is missing a `tenantId String` column"


def test_every_tenant_scoped_model_has_tenant_index() -> None:
    blocks = _model_blocks(SCHEMA_PATH.read_text())
    scoped_models = _tenant_scoped_models(blocks)
    assert scoped_models, "schema has no tenant-scoped models"

    for name in scoped_models:
        body = blocks[name]
        assert _has_tenant_id_index(body), f"model {name} is missing `@@index([tenantId])`"


def test_tenant_model_has_no_tenant_id() -> None:
    blocks = _model_blocks(SCHEMA_PATH.read_text())
    body = blocks["Tenant"]
    assert not re.search(
        r"^\s*tenantId\s+", body, re.MULTILINE
    ), "Tenant model must not carry its own tenantId column"


# Payment field names the seed script writes to. If the schema drifts from
# these names, `prisma db seed` fails at runtime — this test catches the
# rename regression statically. Mirrors acceptance criterion #3 (c).
PAYMENT_REQUIRED_FIELDS = {
    "tenantId": "String",
    "bookingId": "String",
    "amountCents": "Int",
    "currency": "String",
    "provider": "String?",
    "providerRef": "String?",
    "status": "String",
    "paidAt": "DateTime?",
}


def test_payment_model_has_expected_field_names_and_types() -> None:
    blocks = _model_blocks(SCHEMA_PATH.read_text())
    body = blocks["Payment"]
    for field, ptype in PAYMENT_REQUIRED_FIELDS.items():
        # Field declarations look like `name  Type` at start of a line.
        # Type may carry `?` (optional) or `[]` (list) modifiers.
        pattern = re.compile(
            rf"^\s*{re.escape(field)}\s+{re.escape(ptype)}(\s|$)",
            re.MULTILINE,
        )
        assert pattern.search(
            body
        ), f"Payment.{field} must be declared as `{field} {ptype}`; body:\n{body}"


def test_schema_declares_no_prisma_enums() -> None:
    """Acceptance criterion #3 (d): enum fields converted to string/integer.

    Prisma enum blocks are declared with `enum Name { ... }`. The seed script
    writes string literals for status columns, so the schema must not carry
    any `enum` block that would break at insert-time.
    """
    text = SCHEMA_PATH.read_text()
    enum_blocks = re.findall(r"^enum\s+\w+\s*\{", text, re.MULTILINE)
    assert not enum_blocks, (
        f"schema.prisma must not declare Prisma enum blocks (found: {enum_blocks}); "
        "status/type columns must be String or Int columns instead"
    )


def test_status_columns_are_string_typed() -> None:
    """Status-shaped columns exercised by the seed must be `String`, not enums."""
    blocks = _model_blocks(SCHEMA_PATH.read_text())
    for model in ("Booking", "Payment"):
        body = blocks[model]
        pattern = re.compile(r"^\s*status\s+String(\s|$)", re.MULTILINE)
        assert pattern.search(
            body
        ), f"{model}.status must be a `String` column (not an enum reference)"
