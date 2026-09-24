import { NextRequest, NextResponse } from "next/server";

import { jsonError, runForTenant } from "@/app/api/services/_helpers";
import { ledgerEntriesToCsv, loadLedgerEntriesForRange, parseDateRange } from "@/app/lib/payouts";

export const dynamic = "force-dynamic";

/** Exports LedgerEntry rows for a tenant/date range as a CSV download. */
export async function GET(req: NextRequest) {
  const start = req.nextUrl.searchParams.get("start");
  const end = req.nextUrl.searchParams.get("end");
  const range = parseDateRange(start, end);
  if (!range) {
    return jsonError("invalid_date_range", 400);
  }

  return runForTenant(req, async (tenantId) => {
    const entries = await loadLedgerEntriesForRange(tenantId, range);
    const csv = ledgerEntriesToCsv(entries);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="payouts-${start}-to-${end}.csv"`,
      },
    });
  });
}
