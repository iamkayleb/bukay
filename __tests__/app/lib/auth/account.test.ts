import { execFileSync } from "node:child_process";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { POST as login } from "@/app/api/auth/login/route";
import { POST as verify } from "@/app/api/auth/verify/route";
import { __resetOtpStoreForTests } from "@/app/lib/auth/otp";
import { SESSION_COOKIE_NAME, verifySession } from "@/app/lib/auth/session";
import { __resetSmsProviderForTests, setSmsProviderForTests } from "@/app/lib/auth/sms";
import { MemorySmsProvider } from "@/app/lib/sms/memory";

const PHONE_LOCAL = "08120001122";
const PHONE_E164 = "+2348120001122";

const db = new PrismaClient();
let sms: MemorySmsProvider;

function applyMigrations() {
  const prismaBin = path.join(process.cwd(), "node_modules", ".bin", "prisma");
  execFileSync(prismaBin, ["migrate", "deploy"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "pipe",
  });
}

function jsonRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function extractCode(text: string): string {
  const match = text.match(/(\d{6})/);
  if (!match) throw new Error(`no OTP found in: ${text}`);
  return match[1];
}

async function sendCode(): Promise<string> {
  const loginRes = await login(jsonRequest("http://test/api/auth/login", { phone: PHONE_LOCAL }));
  expect(loginRes.status).toBe(200);
  const sent = sms.lastTo(PHONE_E164);
  expect(sent).toBeDefined();
  return extractCode(sent!.body);
}

async function verifyCode(code: string) {
  const res = await verify(
    jsonRequest("http://test/api/auth/verify", { phone: PHONE_LOCAL, code })
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    ok: boolean;
    userId: string;
    tenantId: string;
    phone: string;
  };
  const setCookie = res.headers.get("set-cookie");
  expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
  const token = setCookie!.split(";")[0].slice(`${SESSION_COOKIE_NAME}=`.length);
  const session = verifySession(token);
  return { body, session };
}

async function resetPhoneRows() {
  const users = await db.user.findMany({ where: { phone: PHONE_E164 } });
  const tenantIds = [...new Set(users.map((user) => user.tenantId))];
  if (tenantIds.length > 0) {
    await db.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  }
}

beforeAll(() => {
  applyMigrations();
});

beforeEach(async () => {
  process.env.SESSION_SECRET = "test-secret-must-be-long-enough";
  __resetOtpStoreForTests();
  __resetSmsProviderForTests();
  sms = new MemorySmsProvider();
  setSmsProviderForTests(sms);
  await resetPhoneRows();
});

afterAll(async () => {
  await resetPhoneRows();
  await db.$disconnect();
});

describe("merchant account on verification", () => {
  it("creates one tenant and one owner user on the first sign-in", async () => {
    const tenantsBefore = new Set(
      (await db.tenant.findMany({ select: { id: true } })).map((t) => t.id)
    );
    const code = await sendCode();
    const { body, session } = await verifyCode(code);

    const users = await db.user.findMany({ where: { phone: PHONE_E164 } });
    expect(users).toHaveLength(1);
    const user = users[0];
    expect(user.role).toBe("owner");
    expect(user.tenantId).toBe(body.tenantId);
    expect(body.userId).toBe(user.id);
    expect(body.userId).not.toBe(`user:${PHONE_E164}`);
    expect(tenantsBefore.has(user.tenantId)).toBe(false);

    const tenant = await db.tenant.findUnique({ where: { id: user.tenantId } });
    expect(tenant).not.toBeNull();
    expect(tenant!.slug).toBe(`m-${PHONE_E164.replace(/\D/g, "")}`);
    const owners = await db.user.findMany({ where: { tenantId: user.tenantId } });
    expect(owners).toHaveLength(1);

    expect(session).not.toBeNull();
    expect(session!.sub).toBe(user.id);
    expect(session!.tenantId).toBe(user.tenantId);
    expect(session!.phone).toBe(PHONE_E164);
    expect(session!.sub.startsWith("user:")).toBe(false);
  });

  it("reuses the same tenant and user on a second sign-in", async () => {
    const first = await verifyCode(await sendCode());
    const usersAfterFirst = await db.user.findMany({ where: { phone: PHONE_E164 } });
    const tenantAfterFirst = await db.tenant.findUnique({
      where: { id: first.body.tenantId },
    });
    expect(usersAfterFirst).toHaveLength(1);
    expect(tenantAfterFirst).not.toBeNull();

    __resetOtpStoreForTests();
    const second = await verifyCode(await sendCode());

    expect(second.body.userId).toBe(first.body.userId);
    expect(second.body.tenantId).toBe(first.body.tenantId);
    expect(second.session?.sub).toBe(first.body.userId);
    expect(second.session?.tenantId).toBe(first.body.tenantId);

    const usersAfterSecond = await db.user.findMany({ where: { phone: PHONE_E164 } });
    const tenantAfterSecond = await db.tenant.findUnique({
      where: { id: first.body.tenantId },
    });
    expect(usersAfterSecond).toEqual(usersAfterFirst);
    expect(tenantAfterSecond).toEqual(tenantAfterFirst);
    expect(await db.user.count({ where: { tenantId: first.body.tenantId } })).toBe(1);
  });
});
