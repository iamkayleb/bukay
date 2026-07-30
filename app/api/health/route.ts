import { NextResponse } from "next/server";
import pkg from "../../../package.json";
import { withTenantScope } from "@/app/lib/tenant-scope";

export const dynamic = "force-dynamic";

export const GET = withTenantScope(() => {
  return NextResponse.json({ ok: true, version: pkg.version });
});
