import { NextResponse } from "next/server";
import pkg from "../../../package.json";

export function GET() {
  return NextResponse.json({ ok: true, version: pkg.version });
}
