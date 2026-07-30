"""Contract checks for app visual regression PNG baselines."""

from __future__ import annotations

import struct
from pathlib import Path

SNAPSHOT_DIR = Path(__file__).resolve().parent / "__snapshots__"

EXPECTED_BASELINES = {
    "app-desktop.png": (1280, 900),
    "app-mobile-drawer.png": (390, 844),
    "app-mobile-nondrawer.png": (390, 844),
}

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def _png_size(path: Path) -> tuple[int, int]:
    data = path.read_bytes()
    assert data.startswith(PNG_SIGNATURE), f"{path.name} is not a PNG file"
    assert data[12:16] == b"IHDR", f"{path.name} is missing a PNG IHDR chunk"
    return struct.unpack(">II", data[16:24])


def test_app_visual_regression_baselines_exist_with_expected_names() -> None:
    actual_files = {path.name for path in SNAPSHOT_DIR.glob("*.png")}

    assert set(EXPECTED_BASELINES) <= actual_files


def test_app_visual_regression_baselines_are_valid_pngs() -> None:
    for filename, expected_size in EXPECTED_BASELINES.items():
        assert _png_size(SNAPSHOT_DIR / filename) == expected_size
