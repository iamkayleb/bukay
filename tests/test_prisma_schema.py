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
    "BusinessHour",
    "Blackout",
    "Client",
    "Booking",
    "Payment",
    "AuditLog",
}

# Models the scope requires to exist at all.
REQUIRED_MODELS = EXPECTED_TENANT_SCOPED_MODELS | {"Tenant"}

EXPECTED_ENUMS = {
    "UserRole": {"OWNER", "ADMIN", "STAFF", "VIEWER"},
    "BookingStatus": {"PENDING", "CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"},
    "PaymentStatus": {"PENDING", "PAID", "REFUNDED", "FAILED"},
    "PaymentMethod": {"CASH", "CARD", "MOBILE_MONEY", "BANK_TRANSFER", "OTHER"},
    "DayOfWeek": {
        "MONDAY",
        "TUESDAY",
        "WEDNESDAY",
        "THURSDAY",
        "FRIDAY",
        "SATURDAY",
        "SUNDAY",
    },
}

EXPECTED_TYPED_FIELDS = {
    "User": {"role": "UserRole"},
    "BusinessHour": {"dayOfWeek": "DayOfWeek"},
    "Booking": {"status": "BookingStatus"},
    "Payment": {"method": "PaymentMethod", "status": "PaymentStatus"},
}


def _model_blocks(schema_text: str) -> dict[str, str]:
    """Return a {model_name: body_text} map from a Prisma schema."""
    blocks: dict[str, str] = {}
    pattern = re.compile(r"^model\s+(\w+)\s*\{([^}]*)\}", re.MULTILINE | re.DOTALL)
    for match in pattern.finditer(schema_text):
        blocks[match.group(1)] = match.group(2)
    return blocks


def _enum_blocks(schema_text: str) -> dict[str, set[str]]:
    """Return a {enum_name: values} map from a Prisma schema."""
    enums: dict[str, set[str]] = {}
    pattern = re.compile(r"^enum\s+(\w+)\s*\{([^}]*)\}", re.MULTILINE | re.DOTALL)
    for match in pattern.finditer(schema_text):
        values = {
            line.strip()
            for line in match.group(2).splitlines()
            if line.strip() and not line.strip().startswith("//")
        }
        enums[match.group(1)] = values
    return enums


def _has_tenant_id_column(model_body: str) -> bool:
    return re.search(r"^\s*tenantId\s+String\b", model_body, re.MULTILINE) is not None


def _tenant_scoped_models(blocks: dict[str, str]) -> set[str]:
    return {name for name, body in blocks.items() if _has_tenant_id_column(body)}


def _has_tenant_id_index(model_body: str) -> bool:
    return re.search(r"@@index\(\[\s*tenantId\s*(?:,|\])", model_body) is not None


def _has_tenant_prefixed_index(model_body: str, field: str) -> bool:
    return (
        re.search(rf"@@index\(\[\s*tenantId\s*,\s*{field}\s*\]", model_body) is not None
        or re.search(rf"@@unique\(\[\s*tenantId\s*,\s*{field}\s*\]", model_body) is not None
    )


def test_schema_file_exists() -> None:
    assert SCHEMA_PATH.exists(), f"missing prisma schema at {SCHEMA_PATH}"


def test_all_required_models_present() -> None:
    blocks = _model_blocks(SCHEMA_PATH.read_text())
    missing = REQUIRED_MODELS - blocks.keys()
    assert not missing, f"prisma schema missing required models: {sorted(missing)}"


def test_expected_enums_present() -> None:
    enums = _enum_blocks(SCHEMA_PATH.read_text())
    assert enums == EXPECTED_ENUMS


def test_status_role_payment_and_day_fields_use_enums() -> None:
    blocks = _model_blocks(SCHEMA_PATH.read_text())
    for model, fields in EXPECTED_TYPED_FIELDS.items():
        body = blocks[model]
        for field, enum_name in fields.items():
            assert re.search(
                rf"^\s*{field}\s+{enum_name}\b", body, re.MULTILINE
            ), f"{model}.{field} must use {enum_name}, not String"


def test_expected_tenant_scoped_models_have_tenant_id_column() -> None:
    blocks = _model_blocks(SCHEMA_PATH.read_text())
    for name in EXPECTED_TENANT_SCOPED_MODELS:
        body = blocks[name]
        assert _has_tenant_id_column(body), f"model {name} is missing a `tenantId String` column"


def test_expected_tenant_scoped_model_list_matches_schema() -> None:
    blocks = _model_blocks(SCHEMA_PATH.read_text())
    tenant_scoped_models = _tenant_scoped_models(blocks)
    assert tenant_scoped_models == EXPECTED_TENANT_SCOPED_MODELS, (
        "EXPECTED_TENANT_SCOPED_MODELS must match models with a tenantId column; "
        f"missing from expected: {sorted(tenant_scoped_models - EXPECTED_TENANT_SCOPED_MODELS)}, "
        f"stale expected entries: {sorted(EXPECTED_TENANT_SCOPED_MODELS - tenant_scoped_models)}"
    )


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


def test_client_search_fields_have_tenant_prefixed_indexes() -> None:
    """Client search uses tenant-scoped startsWith filters, so both fields need tenant prefixes."""
    blocks = _model_blocks(SCHEMA_PATH.read_text())
    body = blocks["Client"]

    for field in ("name", "phone"):
        assert _has_tenant_prefixed_index(
            body, field
        ), f"Client search field `{field}` needs a tenant-prefixed index or unique constraint"
