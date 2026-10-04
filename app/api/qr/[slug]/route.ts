import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/app/db/prisma";
import { bookingUrl, buildQrPdf, qrPng } from "@/app/lib/qr-pdf";

export const dynamic = "force-dynamic";

/**
 * GET /api/qr/{slug}            -> application/pdf (branded, printable)
 * GET /api/qr/{slug}?format=png -> image/png of the bare QR code
 */
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: params.slug },
    select: { name: true, slug: true, active: true },
  });
  if (!tenant || !tenant.active) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const origin = req.nextUrl.origin;
  const headers = { "Cache-Control": "no-store" };

  if (req.nextUrl.searchParams.get("format") === "png") {
    const png = await qrPng(bookingUrl(origin, tenant.slug));
    return new NextResponse(new Uint8Array(png), {
      status: 200,
      headers: {
        ...headers,
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="${tenant.slug}-qr.png"`,
      },
    });
  }

  const pdf = buildQrPdf({ name: tenant.name, slug: tenant.slug, origin });
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      ...headers,
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${tenant.slug}-qr.pdf"`,
    },
  });
}
