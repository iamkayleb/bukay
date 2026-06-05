import { NextResponse } from "next/server";
import { version } from "../../../package.json";

export function GET() {
  return NextResponse.json({ ok: true, version });
}
