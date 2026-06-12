import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ ok: true, version: process.env.npm_package_version ?? "0.1.0" });
}
