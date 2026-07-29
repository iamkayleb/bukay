"""Checks for prisma/seed.ts.

These guard the seed-script acceptance criteria from the data-model PR:
`prisma db seed` must insert a demo tenant with exactly three sample
services and CI must catch regressions that break the executable seed.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
SEED_PATH = ROOT / "prisma" / "seed.ts"
PACKAGE_JSON = ROOT / "package.json"


def _seed_text() -> str:
    return SEED_PATH.read_text()


def _extract_balanced_block(text: str, start: int) -> str:
    depth = 0
    for index in range(start, len(text)):
        char = text[index]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return text[start : index + 1]

    raise AssertionError(f"could not find balanced block starting at offset {start}")


def _find_seed_upsert_where_clauses() -> dict[str, str]:
    text = _seed_text()
    clauses: dict[str, str] = {}

    for match in re.finditer(r"prisma\.(?P<model>\w+)\.upsert\(\{", text):
        model = match.group("model")
        call_body = _extract_balanced_block(text, match.end() - 1)
        where_match = re.search(r"\bwhere:\s*\{", call_body)
        assert where_match, f"prisma.{model}.upsert must declare a where clause"
        clauses[model] = _extract_balanced_block(call_body, where_match.end() - 1)

    return clauses


def _package_version(package: str) -> str:
    pkg = json.loads(PACKAGE_JSON.read_text())
    spec = pkg.get("dependencies", {}).get(package) or pkg.get("devDependencies", {}).get(package)
    assert spec, f"could not find {package} version in {PACKAGE_JSON}"
    return spec


def _prepare_node_modules(project_dir: Path) -> Path:
    node_modules = project_dir / "node_modules"
    root_node_modules = ROOT / "node_modules"
    if root_node_modules.exists():
        node_modules.symlink_to(root_node_modules, target_is_directory=True)
        return node_modules / ".bin" / "prisma"

    install = subprocess.run(
        [
            "npm",
            "install",
            "--no-audit",
            "--no-fund",
            "--ignore-scripts",
            f"prisma@{_package_version('prisma')}",
            f"@prisma/client@{_package_version('@prisma/client')}",
            f"tsx@{_package_version('tsx')}",
        ],
        cwd=project_dir,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=120,
        check=False,
    )
    assert install.returncode == 0, install.stdout
    return node_modules / ".bin" / "prisma"


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

        compound_match = re.search(
            rf"\b{compound_key}:\s*\{{\s*tenantId:\s*tenant\.id,",
            where_clause,
            re.DOTALL,
        )
        assert (
            compound_match
        ), f"prisma.{model}.upsert must use the {compound_key} compound unique key"
        assert not re.search(
            r"(?:^|[,{]\s*)tenantId:\s*tenant\.id\s*,?\s*(?:$|[},])",
            where_clause.replace(compound_match.group(0), ""),
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


def test_prisma_db_seed_creates_demo_tenant_on_clean_database(tmp_path: Path) -> None:
    """Acceptance check: `prisma db seed` creates a tenant with slug `demo`."""
    if "DATABASE_URL" not in os.environ:
        pytest.skip("DATABASE_URL is required for live Prisma seed checks")

    project_dir = tmp_path / "project"
    project_dir.mkdir()
    prisma_dir = project_dir / "prisma"
    shutil.copytree(ROOT / "prisma", prisma_dir)
    (project_dir / "package.json").write_text(
        json.dumps(
            {
                "name": "bukay-prisma-seed-test",
                "private": True,
                "prisma": {"seed": "tsx prisma/seed.ts"},
            }
        )
    )
    prisma_bin = _prepare_node_modules(project_dir)
    env = {
        **os.environ,
        "PATH": f"{project_dir / 'node_modules' / '.bin'}{os.pathsep}{os.environ['PATH']}",
    }

    migrate = subprocess.run(
        [
            str(prisma_bin),
            "migrate",
            "dev",
            "--schema",
            "prisma/schema.prisma",
            "--skip-seed",
            "--skip-generate",
        ],
        cwd=project_dir,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env=env,
        timeout=60,
        check=False,
    )
    assert migrate.returncode == 0, migrate.stdout

    generate = subprocess.run(
        [str(prisma_bin), "generate", "--schema", "prisma/schema.prisma"],
        cwd=project_dir,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env=env,
        timeout=60,
        check=False,
    )
    assert generate.returncode == 0, generate.stdout

    seed = subprocess.run(
        [str(prisma_bin), "db", "seed", "--schema", "prisma/schema.prisma"],
        cwd=project_dir,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env=env,
        timeout=60,
        check=False,
    )
    assert seed.returncode == 0, seed.stdout

    verify = subprocess.run(
        [
            str(project_dir / "node_modules" / ".bin" / "tsx"),
            "--eval",
            (
                "import { PrismaClient } from '@prisma/client';"
                "const prisma = new PrismaClient();"
                "try {"
                "const count = await prisma.tenant.count({ where: { slug: 'demo' } });"
                "console.log(count);"
                "} finally { await prisma.$disconnect(); }"
            ),
        ],
        cwd=project_dir,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env=env,
        timeout=60,
        check=False,
    )
    assert verify.returncode == 0, verify.stdout
    demo_tenant_count = int(verify.stdout.strip().splitlines()[-1])

    assert demo_tenant_count == 1, "prisma db seed did not create Tenant.slug = 'demo'"
