import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/app/db/prisma";
import { QrPdfError, buildBrandedQrPdf, normalizeBookingSlug } from "@/app/lib/qr-pdf";

export const dynamic = "force-dynamic";

function jsonError(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

/**
 * Download the branded booking QR PDF for a public shop slug.
 * The code inside the file resolves to `/{slug}`.
 */
export async function GET(
  _request: NextRequest,
  context: { params: { slug: string } }
): Promise<NextResponse> {
  let slug: string;
  try {
    slug = normalizeBookingSlug(decodeURIComponent(context.params.slug ?? ""));
  } catch (error) {
    if (error instanceof QrPdfError) {
      return jsonError("invalid_slug", 400);
    }
    throw error;
  }

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { slug },
      select: { name: true, slug: true },
    });
    if (!tenant) {
      return jsonError("not_found", 404);
    }

    const branded = await buildBrandedQrPdf({
      tenantName: tenant.name,
      slug: tenant.slug,
    });

    return new NextResponse(Buffer.from(branded.pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${branded.filename}"`,
        "Cache-Control": "private, no-store",
        "X-Booking-Path": branded.bookingPath,
      },
    });
  } catch (error) {
    if (error instanceof QrPdfError) {
      return jsonError("invalid_slug", 400);
    }
    console.error("Failed to build booking QR PDF", error);
    return jsonError("qr_pdf_failed", 500);
  }
}
