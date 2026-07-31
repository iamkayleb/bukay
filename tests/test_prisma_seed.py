"""Checks for prisma/seed.ts.

These guard the seed-script acceptance criteria from the data-model PR:
`prisma db seed` must insert a demo tenant with exactly three sample
services and CI must catch regressions that break the executable seed.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SEED_PATH = ROOT / "prisma" / "seed.ts"
PACKAGE_JSON = ROOT / "package.json"

EXPECTED_ENUM_IMPORTS = {
    "UserRole",
    "DayOfWeek",
    "BookingStatus",
    "PaymentMethod",
    "PaymentStatus",
}

EXPECTED_ENUM_USAGES = {
    "UserRole.OWNER",
    "DayOfWeek.MONDAY",
    "DayOfWeek.TUESDAY",
    "DayOfWeek.WEDNESDAY",
    "DayOfWeek.THURSDAY",
    "DayOfWeek.FRIDAY",
    "DayOfWeek.SATURDAY",
    "BookingStatus.CONFIRMED",
    "PaymentMethod.MOBILE_MONEY",
    "PaymentStatus.PAID",
}


def _seed_text() -> str:
    return SEED_PATH.read_text()


def _extract_balanced_block(text: str, opening_brace_index: int) -> str:
    depth = 0
    for index in range(opening_brace_index, len(text)):
        char = text[index]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return text[opening_brace_index : index + 1]
    raise AssertionError("unbalanced block in seed.ts")


def _find_seed_upsert_where_clauses() -> dict[str, str]:
    text = _seed_text()
    clauses: dict[str, str] = {}
    for match in re.finditer(r"prisma\.(\w+)\.upsert\(\s*\{", text):
        model = match.group(1)
        upsert_block = _extract_balanced_block(text, match.end() - 1)
        where_match = re.search(r"\bwhere:\s*\{", upsert_block)
        assert where_match, f"prisma.{model}.upsert must declare a where clause"
        clauses[model] = _extract_balanced_block(upsert_block, where_match.end() - 1)
    return clauses


def test_seed_file_exists() -> None:
    assert SEED_PATH.exists(), f"missing prisma seed at {SEED_PATH}"


def test_seed_declares_demo_tenant_slug() -> None:
    text = _seed_text()
    assert re.search(
        r'DEMO_TENANT_SLUG\s*=\s*"demo"', text
    ), 'seed.ts must declare DEMO_TENANT_SLUG = "demo"'


def test_seed_upserts_tenant() -> None:
    text = _seed_text()
    assert "prisma.tenant.upsert" in text, "seed.ts must upsert the demo tenant"


def test_tenant_scoped_upserts_use_only_compound_unique_key_in_where() -> None:
    expected_compound_keys = {
        "user": "tenantId_email",
        "client": "tenantId_phone",
    }
    upsert_where_clauses = _find_seed_upsert_where_clauses()

    for model, compound_key in expected_compound_keys.items():
        where_clause = upsert_where_clauses.get(model)
        assert where_clause, f"prisma.{model}.upsert must declare a where clause"

        assert re.search(
            rf"\b{compound_key}:\s*\{{\s*tenantId:\s*tenant\.id,",
            where_clause,
            re.DOTALL,
        ), f"prisma.{model}.upsert must use the {compound_key} compound unique key"
        compound_key_match = re.search(rf"{compound_key}:\s*\{{.*?\}}", where_clause, re.DOTALL)
        assert compound_key_match
        assert not re.search(
            r"(?:^|[,{]\s*)tenantId:\s*tenant\.id\s*,?\s*(?:$|[},])",
            where_clause.replace(compound_key_match.group(0), ""),
            re.DOTALL,
        ), f"prisma.{model}.upsert must not include top-level tenantId in where"


def test_all_seed_upserts_are_audited_for_tenant_scoping() -> None:
    """Keep the seed upsert audit aligned with every upsert in prisma/seed.ts."""
    expected_non_tenant_upserts = {"tenant"}
    expected_tenant_scoped_upsert_keys = {
        "user": "tenantId_email",
        "client": "tenantId_phone",
    }
    audited_models = expected_non_tenant_upserts | set(expected_tenant_scoped_upsert_keys)
    upsert_where_clauses = _find_seed_upsert_where_clauses()

    assert set(upsert_where_clauses) == audited_models

    for model, compound_key in expected_tenant_scoped_upsert_keys.items():
        where_clause = upsert_where_clauses[model]
        compound_key_match = re.search(rf"\b{compound_key}:\s*\{{", where_clause)
        assert compound_key_match, f"prisma.{model}.upsert must use {compound_key}"

        compound_key_block = _extract_balanced_block(where_clause, compound_key_match.end() - 1)
        compound_key_end = compound_key_match.end() - 1 + len(compound_key_block)
        remainder = where_clause[: compound_key_match.start()] + where_clause[compound_key_end:]
        assert (
            "tenantId:" not in remainder
        ), f"prisma.{model}.upsert must not include tenantId outside {compound_key}"


def test_seed_defines_exactly_three_services() -> None:
    """Acceptance criterion: demo tenant ships with three sample services."""
    text = _seed_text()
    match = re.search(r"DEMO_SERVICES\s*=\s*\[(.*?)\];", text, re.DOTALL)
    assert match, "seed.ts must declare a DEMO_SERVICES array"
    body = match.group(1)
    # Each service is an object literal with a `name:` field; count those.
    service_names = re.findall(r"name:\s*\"([^\"]+)\"", body)
    assert (
        len(service_names) == 3
    ), f"DEMO_SERVICES must contain exactly 3 services, found {service_names}"


def test_seed_services_have_required_fields() -> None:
    text = _seed_text()
    match = re.search(r"DEMO_SERVICES\s*=\s*\[(.*?)\];", text, re.DOTALL)
    assert match
    body = match.group(1)
    for field in ("name", "durationMinutes", "priceCents"):
        assert re.search(rf"\b{field}:", body), f"DEMO_SERVICES entries must declare {field}"


def test_package_json_wires_seed_script() -> None:
    """`prisma db seed` only works if package.json points at seed.ts."""
    pkg = json.loads(PACKAGE_JSON.read_text())
    seed_cmd = pkg.get("prisma", {}).get("seed", "")
    assert "prisma/seed.ts" in seed_cmd, (
        "package.json `prisma.seed` must reference prisma/seed.ts; " f"got: {seed_cmd!r}"
    )


def test_seed_imports_prisma_enums() -> None:
    text = _seed_text()
    for enum_name in EXPECTED_ENUM_IMPORTS:
        assert enum_name in text, f"seed.ts must import {enum_name} from @prisma/client"


def test_seed_uses_enum_values_for_typed_fields() -> None:
    text = _seed_text()
    for enum_usage in EXPECTED_ENUM_USAGES:
        assert enum_usage in text, f"seed.ts must use {enum_usage}"

    forbidden_string_values = [
        'role: "owner"',
        'status: "confirmed"',
        'status: "paid"',
        'provider: "mobile_money"',
        'providerRef: "demo-mm-0001"',
        "JSON.stringify({ services:",
    ]
    for value in forbidden_string_values:
        assert value not in text, f"seed.ts still contains flattened field value {value}"
