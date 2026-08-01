"""Regression guard: booking surfaces must adopt the ?active=true filter.

PR #199 introduced `app/lib/services/bookable.ts` so every booking surface can
call `fetchBookableServices()` instead of hitting `/api/services` directly.
That helper hardcodes `?active=true`, which is the only thing that keeps
archived services out of booking UIs.

The acceptance criterion for PR #195 relies on "existing booking code already
passing active=true". Without an enforced invariant, a future booking surface
could silently regress by calling `fetch('/api/services')` without the filter.
This guard scans the app tree and fails if any caller of `/api/services` is
neither the shared helper nor an explicitly allow-listed admin surface, nor
carries a deliberate `active=` filter in its URL.

Update `_ADMIN_SURFACES` when a new non-booking surface is intentionally added
and needs to see archived services (e.g., a new admin management page). Every
other caller must adopt `fetchBookableServices()` from `bookable.ts`.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP_DIR = ROOT / "app"
BOOKABLE_HELPER = APP_DIR / "lib" / "services" / "bookable.ts"

_SERVICES_PATH_RE = re.compile(r"""["'`]/api/services(?![A-Za-z0-9_/-])[^"'`]*["'`]""")
_ACTIVE_PARAM_RE = re.compile(r"[?&]active=")

# Paths (relative to repo root, forward slashes) that are allowed to fetch the
# unfiltered services list. Anything not on this list must go through
# `fetchBookableServices()` or explicitly include `active=` in its URL.
_ADMIN_SURFACES = frozenset(
    {
        # Staff-facing services management page: needs archived services so an
        # admin can restore them. Not a booking surface.
        "app/(app)/services/services-manager.tsx",
    }
)

# Files exempt from the scan entirely because they DEFINE the contract rather
# than consume it (helper module, API route implementation).
_CONTRACT_FILES = frozenset(
    {
        "app/lib/services/bookable.ts",
        "app/api/services/route.ts",
        "app/api/services/_helpers.ts",
        "app/api/services/[id]/route.ts",
    }
)


def _rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def _iter_app_ts_files() -> list[Path]:
    files: list[Path] = []
    for pattern in ("*.ts", "*.tsx"):
        files.extend(APP_DIR.rglob(pattern))
    return files


def _find_services_url_literals(source: str) -> list[str]:
    """Return every string literal that looks like a `/api/services...` URL.

    We only match the collection endpoint (`/api/services` optionally followed
    by a query string). Per-item URLs (`/api/services/${id}`) are excluded via
    the negative lookahead in the regex — they operate on a specific record and
    are not the booking-surface listing.
    """
    return _SERVICES_PATH_RE.findall(source)


def test_every_services_fetcher_adopts_the_booking_surface_contract() -> None:
    assert BOOKABLE_HELPER.exists(), (
        f"bookable helper missing at {BOOKABLE_HELPER}; the contract cannot be "
        "enforced without it."
    )

    violations: list[str] = []
    scanned = 0

    for path in _iter_app_ts_files():
        rel = _rel(path)
        if rel in _CONTRACT_FILES:
            continue

        source = path.read_text()
        literals = _find_services_url_literals(source)
        if not literals:
            continue

        scanned += 1

        if rel in _ADMIN_SURFACES:
            # Allow-listed admin surface: it may fetch the unfiltered list.
            continue

        # For non-admin callers, every collection-URL literal must either be
        # accompanied by an explicit `active=` filter or must be delegated
        # to the shared helper (which owns the filter).
        uses_helper = "fetchBookableServices" in source or "BOOKABLE_SERVICES_PATH" in source

        for literal in literals:
            if _ACTIVE_PARAM_RE.search(literal):
                continue
            if uses_helper:
                continue
            violations.append(
                f"{rel}: fetches {literal} without ?active=... and without "
                "importing fetchBookableServices/BOOKABLE_SERVICES_PATH. Use "
                "the shared helper from app/lib/services/bookable.ts."
            )

    assert scanned > 0, (
        "Expected to scan at least one caller of /api/services; the regex or "
        "app directory layout may have drifted. Update this guard."
    )
    assert not violations, "Booking-surface contract violations:\n  - " + "\n  - ".join(violations)


def test_admin_surface_allowlist_stays_grounded_in_the_repo() -> None:
    """Every allow-listed admin surface must still exist.

    Prevents the allow-list from silently accumulating stale entries after a
    rename or deletion, which would create a hole in the contract.
    """
    for rel in _ADMIN_SURFACES:
        assert (ROOT / rel).exists(), (
            f"admin allow-list entry {rel!r} no longer exists. Remove it from "
            "_ADMIN_SURFACES or update it to the new path."
        )


def test_admin_surface_allowlist_entries_actually_need_the_exemption() -> None:
    """Allow-listed files must fetch services *without* `?active=true`.

    The whole point of being on the allow-list is that the surface intentionally
    needs the unfiltered services list (e.g., to let an admin restore archived
    rows). If an allow-listed file only ever fetches with `?active=true`, the
    exemption is unnecessary and hides drift — the entry should move to the
    shared helper instead. Fail loudly so the allow-list can't accumulate
    rubber-stamp entries.
    """
    for rel in _ADMIN_SURFACES:
        path = ROOT / rel
        source = path.read_text()
        literals = _find_services_url_literals(source)
        assert literals, (
            f"admin allow-list entry {rel!r} does not fetch /api/services at "
            "all. The exemption is not needed — remove it from _ADMIN_SURFACES."
        )
        needs_unfiltered = any(not _ACTIVE_PARAM_RE.search(literal) for literal in literals)
        assert needs_unfiltered, (
            f"admin allow-list entry {rel!r} only fetches with an ?active= "
            "filter, so it does not need the exemption. Either remove it from "
            "_ADMIN_SURFACES or route it through fetchBookableServices()."
        )


def test_url_regex_matches_collection_endpoint_only() -> None:
    """The regex must catch listing URLs but skip per-item URLs.

    This proves the guard actually detects the shapes we care about — a
    future refactor that broadens or narrows the pattern would trip a
    concrete assertion instead of silently letting violations through.
    """
    catches = [
        'fetch("/api/services")',
        "fetch('/api/services?active=false')",
        "fetch(`/api/services?tenant=abc`)",
    ]
    skips = [
        "fetch(`/api/services/${id}`)",
        'fetch("/api/services/abc-123")',
        'fetch("/api/services-old")',  # trailing dash: different endpoint
    ]

    for src in catches:
        assert _find_services_url_literals(src), f"regex missed listing URL in {src!r}"
    for src in skips:
        assert not _find_services_url_literals(
            src
        ), f"regex incorrectly matched non-listing URL in {src!r}"


def test_guard_flags_a_non_adopter_and_accepts_helper_or_active_filter() -> None:
    """The pass/fail branches must actually differ.

    Simulate three booking-surface bodies and confirm the classifier splits
    them correctly: the raw fetch is a violation; the explicit `?active=true`
    literal is fine; and importing the shared helper is fine.
    """
    raw = 'const res = await fetch("/api/services");'
    active = 'const res = await fetch("/api/services?active=true");'
    helper = (
        'import { fetchBookableServices } from "@/app/lib/services/bookable";\n'
        "const items = await fetchBookableServices();"
    )

    def classify(source: str) -> bool:
        literals = _find_services_url_literals(source)
        uses_helper = "fetchBookableServices" in source or "BOOKABLE_SERVICES_PATH" in source
        # A source is a violation iff it has a listing literal that neither
        # carries `active=` nor is paired with a helper import.
        return any(not _ACTIVE_PARAM_RE.search(literal) and not uses_helper for literal in literals)

    assert classify(raw), "raw fetch without filter should be flagged as a violation"
    assert not classify(active), "explicit ?active=... URL should be accepted"
    assert not classify(helper), "helper-based call should be accepted"
