"""Static checks on prisma/schema.prisma.

These guard the multi-tenant invariant from the data-model PR:
every tenant-owned model must carry a `tenantId` column AND declare
`@@index([tenantId])`. Run as part of normal pytest; no DB required.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCHEMA_PATH = ROOT / "prisma" / "schema.prisma"
PACKAGE_JSON = ROOT / "package.json"

EXPECTED_TENANT_SCOPED_MODELS = {
    "User",
    "Service",
    "Staff",
    "BusinessHour",
    "Client",
    "Booking",
    "SlotHold",
    "Payment",
    "AuditLog",
    "DeadLetter",
}

# Models the scope requires to exist at all.
REQUIRED_MODELS = EXPECTED_TENANT_SCOPED_MODELS | {"Tenant", "IdempotencyKey"}

# Relation fields the suite asserts so schema drift cannot drop FK wiring.
# Values are (field_name, type_with_optional_suffix) tuples.
EXPECTED_RELATIONS: dict[str, tuple[tuple[str, str], ...]] = {
    "User": (("tenant", "Tenant"),),
    "Service": (("tenant", "Tenant"), ("bookings", "Booking[]"), ("slotHolds", "SlotHold[]")),
    "Staff": (("tenant", "Tenant"), ("bookings", "Booking[]")),
    "BusinessHour": (("tenant", "Tenant"),),
    "Client": (("tenant", "Tenant"), ("bookings", "Booking[]")),
    "Booking": (
        ("tenant", "Tenant"),
        ("client", "Client"),
        ("service", "Service"),
        ("staff", "Staff?"),
        ("payments", "Payment[]"),
    ),
    "SlotHold": (
        ("tenant", "Tenant"),
        ("service", "Service"),
    ),
    "Payment": (
        ("tenant", "Tenant"),
        ("booking", "Booking"),
    ),
    "AuditLog": (("tenant", "Tenant"),),
    "DeadLetter": (("tenant", "Tenant?"),),
    "Tenant": (
        ("users", "User[]"),
        ("services", "Service[]"),
        ("staff", "Staff[]"),
        ("businessHours", "BusinessHour[]"),
        ("clients", "Client[]"),
        ("bookings", "Booking[]"),
        ("payments", "Payment[]"),
        ("auditLogs", "AuditLog[]"),
        ("slotHolds", "SlotHold[]"),
        ("deadLetters", "DeadLetter[]"),
    ),
}


def _strip_prisma_line_comments(schema_text: str) -> str:
    """Remove // and /// comments so `}` inside docs cannot truncate model bodies."""
    return re.sub(r"//.*?$", "", schema_text, flags=re.MULTILINE)


def _model_blocks(schema_text: str) -> dict[str, str]:
    """Return a {model_name: body_text} map from a Prisma schema."""
    blocks: dict[str, str] = {}
    stripped = _strip_prisma_line_comments(schema_text)
    pattern = re.compile(r"^model\s+(\w+)\s*\{([^}]*)\}", re.MULTILINE | re.DOTALL)
    for match in pattern.finditer(stripped):
        blocks[match.group(1)] = match.group(2)
    return blocks


def _has_tenant_id_column(model_body: str) -> bool:
    return re.search(r"^\s*tenantId\s+String\b", model_body, re.MULTILINE) is not None


def _tenant_scoped_models(blocks: dict[str, str]) -> set[str]:
    return {name for name, body in blocks.items() if _has_tenant_id_column(body)}


def _has_tenant_id_index(model_body: str) -> bool:
    return re.search(r"@@index\(\[\s*tenantId\s*(?:,|\])", model_body) is not None


def _package_version(package: str) -> str:
    pkg = json.loads(PACKAGE_JSON.read_text())
    spec = pkg.get("dependencies", {}).get(package) or pkg.get("devDependencies", {}).get(package)
    assert spec, f"could not find {package} version in {PACKAGE_JSON}"
    return spec


def _prepare_prisma_bin(project_dir: Path) -> Path:
    """Install (or reuse) a local prisma CLI so validate doesn't hang on npx downloads."""
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
        ],
        cwd=project_dir,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=120,
        check=False,
    )
    assert install.returncode == 0, install.stdout
    prisma_bin = node_modules / ".bin" / "prisma"
    assert prisma_bin.exists(), f"prisma CLI missing after npm install:\n{install.stdout}"
    return prisma_bin


def test_schema_file_exists() -> None:
    assert SCHEMA_PATH.exists(), f"missing prisma schema at {SCHEMA_PATH}"


def test_schema_is_syntactically_valid_via_prisma_validate(tmp_path: Path) -> None:
    """Acceptance check: Prisma must parse schema.prisma without errors."""
    project_dir = tmp_path / "project"
    project_dir.mkdir()
    prisma_dir = project_dir / "prisma"
    prisma_dir.mkdir()
    shutil.copy(SCHEMA_PATH, prisma_dir / "schema.prisma")
    (project_dir / "package.json").write_text(
        json.dumps({"name": "bukay-prisma-validate-test", "private": True}),
        encoding="utf-8",
    )

    prisma_bin = _prepare_prisma_bin(project_dir)
    env = {
        **os.environ,
        "PATH": f"{project_dir / 'node_modules' / '.bin'}{os.pathsep}{os.environ['PATH']}",
    }
    result = subprocess.run(
        [str(prisma_bin), "validate", "--schema", "prisma/schema.prisma"],
        cwd=project_dir,
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=60,
        check=False,
    )
    assert result.returncode == 0, result.stdout
    assert re.search(r"\bis valid\b", result.stdout, re.IGNORECASE), result.stdout


def test_schema_defines_exact_required_models() -> None:
    blocks = _model_blocks(SCHEMA_PATH.read_text())
    assert len(blocks) == len(
        REQUIRED_MODELS
    ), f"expected exactly {len(REQUIRED_MODELS)} Prisma models, found {sorted(blocks)}"
    assert (
        set(blocks) == REQUIRED_MODELS
    ), f"schema models {sorted(blocks)} do not match required set {sorted(REQUIRED_MODELS)}"


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
    assert (
        scoped_models == EXPECTED_TENANT_SCOPED_MODELS
    ), f"unexpected tenant-scoped models: {sorted(scoped_models)}"

    for name in scoped_models:
        body = blocks[name]
        assert _has_tenant_id_index(body), f"model {name} is missing `@@index([tenantId])`"


def test_tenant_model_has_no_tenant_id() -> None:
    blocks = _model_blocks(SCHEMA_PATH.read_text())
    body = blocks["Tenant"]
    assert not re.search(
        r"^\s*tenantId\s+", body, re.MULTILINE
    ), "Tenant model must not carry its own tenantId column"


def _has_relation_field(model_body: str, field_name: str, related_type: str) -> bool:
    """True when the model declares `fieldName RelatedType`."""
    # Do not use \b after the type: Prisma array/optional suffixes (`[]`, `?`) are
    # non-word characters, so a trailing word-boundary would never match.
    pattern = re.compile(
        rf"^\s*{re.escape(field_name)}\s+{re.escape(related_type)}(?:\s|$)",
        re.MULTILINE,
    )
    return pattern.search(model_body) is not None


def test_required_model_relations_are_declared() -> None:
    blocks = _model_blocks(SCHEMA_PATH.read_text())
    assert set(blocks) >= REQUIRED_MODELS

    for model_name, relations in EXPECTED_RELATIONS.items():
        body = blocks[model_name]
        for field_name, related_type in relations:
            assert _has_relation_field(body, field_name, related_type), (
                f"model {model_name} is missing relation " f"`{field_name} {related_type}`"
            )
