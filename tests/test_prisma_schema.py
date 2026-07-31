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


SCALAR_TYPES = {
    "String",
    "Int",
    "DateTime",
    "Boolean",
    "Float",
    "Decimal",
    "BigInt",
    "Bytes",
    "Json",
}


def _referenced_model_types(model_body: str) -> set[str]:
    relation_types = re.findall(
        r"^\s*\w+\s+(\w+)(?:\?|\[\])?\s+@relation",
        model_body,
        re.MULTILINE,
    )
    list_types = re.findall(r"^\s*\w+\s+(\w+)\[\]\s*$", model_body, re.MULTILINE)
    return {t for t in {*relation_types, *list_types} if t not in SCALAR_TYPES}


def test_service_relations_do_not_reference_missing_models() -> None:
    """Guard the PR #195 concern: relation targets on Service must actually exist.

    A prior iteration removed the `staffAssignments StaffService[]` relation
    without also removing the StaffService model; a symmetric mistake in
    reverse would leave a dangling relation. This test fails loudly if the
    Service block ever references a model type that isn't declared.
    """
    schema_text = SCHEMA_PATH.read_text()
    blocks = _model_blocks(schema_text)
    declared = set(blocks.keys())

    for referenced in _referenced_model_types(blocks["Service"]):
        assert referenced in declared, (
            f"Service references undefined model {referenced!r} — either add "
            "the model back or remove the relation."
        )


def test_no_model_relation_references_missing_model() -> None:
    """Every relation across the entire schema must point at a declared model.

    Symmetric to the Service guard: if any model still references StaffService
    (or any other undeclared type) — either as a direct relation or as an
    implicit list relation — the schema is invalid and Prisma client
    generation would fail. This catches the removed-StaffService concern in
    both directions (Service → StaffService AND StaffService → Service).
    """
    schema_text = SCHEMA_PATH.read_text()
    blocks = _model_blocks(schema_text)
    declared = set(blocks.keys())

    for model_name, body in blocks.items():
        for referenced in _referenced_model_types(body):
            assert referenced in declared, (
                f"Model {model_name!r} references undefined model "
                f"{referenced!r} — either declare the model or drop the relation."
            )


def test_removed_staff_service_model_stays_removed() -> None:
    """StaffService was removed in PR #195; regressing it silently would
    revive the multi-tenant staff-assignment path we intentionally deferred.
    Fail loudly if it (or a stray `staffAssignments` relation) reappears
    without a companion migration reintroducing the table.
    """
    schema_text = SCHEMA_PATH.read_text()
    blocks = _model_blocks(schema_text)

    assert "StaffService" not in blocks, (
        "StaffService model reappeared in schema.prisma — this was intentionally "
        "removed in PR #195. If reintroducing, also add a migration and update tests."
    )

    for model_name, body in blocks.items():
        assert not re.search(r"^\s*staffAssignments\s+", body, re.MULTILINE), (
            f"Model {model_name!r} declares a `staffAssignments` relation but "
            "StaffService is not defined — remove the relation or add the model back."
        )
