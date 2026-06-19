import { NextRequest, NextResponse } from "next/server";
import { withSessionTenant } from "@/app/lib/api/require-session-tenant";
import { flattenFieldErrors, updateServiceSchema } from "@/app/lib/services/schemas";
import { getServiceRepository, toServiceDto } from "@/app/lib/services/repository";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

function notFound() {
  return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  return withSessionTenant(req, async ({ tenantId }) => {
    const record = await getServiceRepository().findById(tenantId, ctx.params.id);
    if (!record) return notFound();
    return NextResponse.json({ ok: true, service: toServiceDto(record) });
  });
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  return withSessionTenant(req, async ({ tenantId }) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    const parsed = updateServiceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "validation_failed", fieldErrors: flattenFieldErrors(parsed.error) },
        { status: 400 }
      );
    }

    try {
      const updated = await getServiceRepository().update(tenantId, ctx.params.id, parsed.data);
      if (!updated) return notFound();
      return NextResponse.json({ ok: true, service: toServiceDto(updated) });
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

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  return withSessionTenant(req, async ({ tenantId }) => {
    const archived = await getServiceRepository().archive(tenantId, ctx.params.id);
    if (!archived) return notFound();
    return NextResponse.json({ ok: true, service: toServiceDto(archived) });
  });
}
