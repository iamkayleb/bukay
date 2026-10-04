import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/app/db/prisma";
import { buildQrPdf } from "@/app/lib/qr-pdf";

type RouteContext = { params: { slug: string } };

export function bookingUrlForSlug(slug: string, requestUrl: string): string {
  const url = new URL(requestUrl);
  url.pathname = `/${encodeURIComponent(slug)}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const slug = params.slug.trim().toLowerCase();
  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { name: true, slug: true },
  });

  if (!tenant) {
    return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });
  }

  const pdf = buildQrPdf({
    businessName: tenant.name,
    bookingUrl: bookingUrlForSlug(tenant.slug, request.url),
  });

  const body = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;

  return new NextResponse(body, {
    headers: {
      "Content-Disposition": `attachment; filename="${tenant.slug}-booking-qr.pdf"`,
      "Content-Length": String(pdf.byteLength),
      "Content-Type": "application/pdf",
    },
  });
}
