"""Static checks on prisma/seed.ts.

These guard the seed-script acceptance criteria from the data-model PR:
`prisma db seed` must insert a demo tenant with exactly three sample
services. We can't execute the TypeScript seed from pytest, but we can
assert the seed source declares those invariants so a regression that
removes a service or renames the demo slug is caught in CI.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SEED_PATH = ROOT / "prisma" / "seed.ts"
PACKAGE_JSON = ROOT / "package.json"


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
            rf"prisma\.{model}\.upsert\(\{{\s*where:\s*\{{\s*tenantId:\s*tenant\.id,",
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
    for field in ("name", "durationMinutes", "priceKobo"):
        assert re.search(rf"\b{field}:", body), f"DEMO_SERVICES entries must declare {field}"


def test_package_json_wires_seed_script() -> None:
    """`prisma db seed` only works if package.json points at seed.ts."""
    pkg = json.loads(PACKAGE_JSON.read_text())
    seed_cmd = pkg.get("prisma", {}).get("seed", "")
    assert "prisma/seed.ts" in seed_cmd, (
        "package.json `prisma.seed` must reference prisma/seed.ts; " f"got: {seed_cmd!r}"
    )
