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


def test_tenant_scoped_upserts_have_top_level_tenant_id() -> None:
    text = _seed_text()
    for model in ("user", "client"):
        assert re.search(
            rf"prisma\.{model}\.upsert\(\{{\s*where:\s*\{{"
            rf"\s*tenantId_\w+:\s*\{{\s*tenantId:\s*tenant\.id,",
            text,
        ), f"prisma.{model}.upsert must include a top-level tenantId in where"


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
