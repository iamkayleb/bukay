"""Executable guard for the booking-surface contract documented in PR #199.

The `GET /api/services?active=true` filter only hides archived services if
booking-surface callers actually pass the parameter. To keep that dependency
from silently rotting away, we assert two invariants:

1. `docs/DATA_MODEL.md` calls out the `?active=true` obligation on the
   Service section, so anyone building a new booking surface sees it.
2. `app/api/services/route.ts` still carries the contract comment that
   points implementers at the docs.

Either check failing means the documented dependency has drifted.
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_MODEL_DOC = ROOT / "docs" / "DATA_MODEL.md"
SERVICES_ROUTE = ROOT / "app" / "api" / "services" / "route.ts"


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


def test_services_route_carries_booking_contract_comment() -> None:
    text = SERVICES_ROUTE.read_text()
    assert "?active=true" in text, "services route must reference the ?active=true filter contract"
    assert "DATA_MODEL.md" in text, (
        "services route contract comment must link back to docs/DATA_MODEL.md "
        "so callers can find the full rationale."
    )
