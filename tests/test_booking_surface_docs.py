"""Executable guard for the booking-surface contract documented in PR #199.

The `GET /api/services?active=true` filter only hides archived services if
booking-surface callers actually pass the parameter. To keep that dependency
from silently rotting away, we assert these invariants:

1. `docs/DATA_MODEL.md` calls out the `?active=true` obligation on the
   Service section, so anyone building a new booking surface sees it.
2. `app/api/services/route.ts` still carries the contract comment that
   points implementers at the docs.
3. `app/lib/services/bookable.ts` exists and hardcodes the `?active=true`
   filter so booking surfaces satisfy the contract by construction.

Any check failing means the documented dependency has drifted.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_MODEL_DOC = ROOT / "docs" / "DATA_MODEL.md"
SERVICES_ROUTE = ROOT / "app" / "api" / "services" / "route.ts"
BOOKABLE_HELPER = ROOT / "app" / "lib" / "services" / "bookable.ts"


def test_data_model_documents_active_true_for_booking_surfaces() -> None:
    text = DATA_MODEL_DOC.read_text()
    assert "?active=true" in text, (
        "docs/DATA_MODEL.md must document that booking surfaces pass "
        "`?active=true` to /api/services (see PR #199 concern)."
    )
    assert "booking surface" in text.lower(), (
        "docs/DATA_MODEL.md must mention the booking-surface caller so future "
        "surface implementers know they own the filter."
    )
    assert "fetchBookableServices" in text, (
        "docs/DATA_MODEL.md must point booking surfaces at the shared "
        "fetchBookableServices() helper so the contract is enforced by construction."
    )


def test_services_route_carries_booking_contract_comment() -> None:
    text = SERVICES_ROUTE.read_text()
    assert "?active=true" in text, "services route must reference the ?active=true filter contract"
    assert "DATA_MODEL.md" in text, (
        "services route contract comment must link back to docs/DATA_MODEL.md "
        "so callers can find the full rationale."
    )
    assert "fetchBookableServices" in text, (
        "services route contract comment must point callers at the shared "
        "fetchBookableServices() helper so future booking surfaces can adopt it."
    )


def test_bookable_helper_hardcodes_active_true_filter() -> None:
    """The shared client helper for booking surfaces must never omit the filter.

    We assert on the literal path constant so any future refactor that
    strips the `?active=true` query fragment fails this test immediately.
    """
    assert BOOKABLE_HELPER.exists(), (
        f"missing shared bookable-services helper at {BOOKABLE_HELPER}. Booking "
        "surfaces need this to satisfy the ?active=true contract by construction."
    )
    text = BOOKABLE_HELPER.read_text()
    assert 'BOOKABLE_SERVICES_PATH = "/api/services?active=true"' in text, (
        "bookable.ts must export BOOKABLE_SERVICES_PATH pinned to "
        "`/api/services?active=true` so the filter cannot be silently dropped."
    )
    assert (
        "fetchBookableServices" in text
    ), "bookable.ts must export a fetchBookableServices function callers can use."


def test_services_route_actually_reads_and_applies_the_active_filter() -> None:
    """The GET handler in route.ts must actually read `active` and pass it to prisma.

    The doc/comment guards above prove intent; this guard proves behavior. A
    regression that dropped the query-string parsing or the `where.active`
    clause would still leave the comment intact but silently return archived
    rows to booking surfaces. That would break the PR #195 acceptance
    criterion in a way none of the string-scanning tests would notice.
    """
    text = SERVICES_ROUTE.read_text()

    # The handler must pull `active` off the URL's search params — either
    # form is acceptable (`searchParams.get("active")` on the request URL).
    reads_param = re.search(
        r"searchParams\.get\(\s*[\"']active[\"']\s*\)",
        text,
    )
    assert reads_param, (
        'GET /api/services must call searchParams.get("active") — the '
        "?active=true contract cannot work without reading the query parameter."
    )

    # The handler must forward that value into the prisma where clause. We
    # look for a `where:` object and then an `active:` key appearing before
    # `orderBy` (or the closing paren of findMany). This tolerates both the
    # inline literal `{ ...active: filter }` and spread-based conditionals
    # like `...(activeFilter === undefined ? {} : { active: activeFilter })`.
    where_to_orderby = re.search(
        r"findMany\s*\(\s*\{(?P<body>.*?)(?:orderBy\s*:|\}\s*\))",
        text,
        re.DOTALL,
    )
    assert where_to_orderby, "GET /api/services must call findMany with an options object"
    body = where_to_orderby.group("body")
    assert re.search(r"\bwhere\s*:", body), "findMany options must include a `where` clause"
    assert re.search(r"\bactive\s*:", body), (
        "GET /api/services must apply `active` inside its prisma `where` "
        "clause. Without this, `?active=true` is parsed but ignored and "
        "archived services still reach booking surfaces."
    )


def test_admin_services_manager_can_load_archived_rows() -> None:
    """The staff-facing services page must NOT adopt the ?active=true filter.

    The booking-surface contract only makes sense if the admin surface is
    deliberately unfiltered — that's how operators restore archived services.
    If a well-meaning refactor changed this page to use the bookable helper,
    archived rows would disappear from the admin UI and the archive/restore
    flow would silently break. Fail loudly if that happens.
    """
    manager = ROOT / "app" / "(app)" / "services" / "services-manager.tsx"
    assert manager.exists(), (
        f"admin services manager missing at {manager}. The admin exemption in "
        "the booking-surface allow-list assumes this file exists."
    )
    text = manager.read_text()
    assert 'fetch("/api/services"' in text or "fetch('/api/services'" in text, (
        "services-manager.tsx must load /api/services without the ?active= "
        "filter so admins can see and restore archived services. If this "
        "surface intentionally moved to fetchBookableServices(), remove it "
        "from the admin allow-list in test_booking_surface_adoption.py."
    )
