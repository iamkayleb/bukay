import { NextRequest, NextResponse } from "next/server";
import { withSessionTenant } from "@/app/lib/api/require-session-tenant";
import { createServiceSchema, flattenFieldErrors } from "@/app/lib/services/schemas";
import { getServiceRepository, toServiceDto } from "@/app/lib/services/repository";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withSessionTenant(req, async ({ tenantId }) => {
    const url = new URL(req.url);
    const includeInactive = url.searchParams.get("includeInactive") === "true";
    const records = await getServiceRepository().list(tenantId, { includeInactive });
    return NextResponse.json({
      ok: true,
      services: records.map(toServiceDto),
    });
  });
}

export async function POST(req: NextRequest) {
  return withSessionTenant(req, async ({ tenantId }) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    const parsed = createServiceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "validation_failed", fieldErrors: flattenFieldErrors(parsed.error) },
        { status: 400 }
      );
    }

    try {
      const created = await getServiceRepository().create(tenantId, parsed.data);
      return NextResponse.json({ ok: true, service: toServiceDto(created) }, { status: 201 });
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === "P2002") {
        return NextResponse.json(
          {
            ok: false,
            error: "validation_failed",
            fieldErrors: { name: ["A service with that name already exists"] },
          },
          { status: 409 }
        );
      }
      throw err;
    }
  });
}
