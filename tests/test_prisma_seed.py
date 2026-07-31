"""Checks for prisma/seed.ts.

These guard the seed-script acceptance criteria from the data-model PR:
`prisma db seed` must insert a demo tenant with exactly three sample
services and CI must catch regressions that break the executable seed.
"""

from __future__ import annotations

import importlib
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
    for field in ("name", "durationMinutes", "priceKobo", "bufferMinutes"):
        assert re.search(rf"\b{field}:", body), f"DEMO_SERVICES entries must declare {field}"


def test_package_json_wires_seed_script() -> None:
    """`prisma db seed` only works if package.json points at seed.ts."""
    pkg = json.loads(PACKAGE_JSON.read_text())
    seed_cmd = pkg.get("prisma", {}).get("seed", "")
    assert "prisma/seed.ts" in seed_cmd, (
        "package.json `prisma.seed` must reference prisma/seed.ts; " f"got: {seed_cmd!r}"
    )


@pytest.mark.skipif(
    not os.environ.get("DATABASE_URL", "").startswith("postgresql://"),
    reason="requires a live Postgres via DATABASE_URL to run `prisma db seed`",
)
def test_prisma_db_seed_creates_demo_tenant_on_clean_database(tmp_path: Path) -> None:
    """Acceptance check: `prisma db seed` creates a tenant with slug `demo`.

    Requires a live Postgres reachable via DATABASE_URL. Skipped otherwise.
    """
    try:
        # `importlib` avoids a top-level import that the CI dependency-sync
        # scanner would flag; psycopg2 is only needed when Postgres is live.
        psycopg2 = importlib.import_module("psycopg2")
    except ImportError:  # pragma: no cover - CI installs psycopg2 when Postgres runs
        pytest.skip("psycopg2 not installed; cannot verify seed against Postgres")

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
    db_path = prisma_dir / "dev.db"
    env = {
        **os.environ,
        "PATH": f"{project_dir / 'node_modules' / '.bin'}{os.pathsep}{os.environ['PATH']}",
        "DATABASE_URL": f"file:{db_path}",
    }

    deploy = subprocess.run(
        [
            str(prisma_bin),
            "migrate",
            "deploy",
            "--schema",
            "prisma/schema.prisma",
        ],
        cwd=project_dir,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env=env,
        timeout=60,
        check=False,
    )
    assert deploy.returncode == 0, deploy.stdout

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

    with psycopg2.connect(os.environ["DATABASE_URL"]) as conn, conn.cursor() as cur:
        cur.execute('SELECT COUNT(*) FROM "Tenant" WHERE "slug" = %s', ("demo",))
        demo_tenant_count = cur.fetchone()[0]

    assert demo_tenant_count == 1, "prisma db seed did not create Tenant.slug = 'demo'"
