import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Real SQLite and the application's tenant-guarded Prisma client; no delegate mocks.
const requestHeaders = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  headers: () => new Headers(requestHeaders.cookie ? { cookie: requestHeaders.cookie } : {}),
}));

import { GET, PUT } from "@/app/api/business-hours/route";
import { saveBusinessHours } from "@/app/(app)/settings/business-hours-form";
import SettingsPage from "@/app/(app)/settings/page";
import PublicBookPage from "@/app/[slug]/book/page";
import { SESSION_COOKIE_NAME, signSession } from "@/app/lib/auth/session";
import { fillWeek, type BusinessHourRow } from "@/app/lib/business-hours";

const db = new PrismaClient();
const tenantId = "business-hours-route";
const otherTenantId = "business-hours-route-other";
const SECRET = "business-hours-test-secret-0123456789";

function request(body?: unknown, method = "PUT", tenant = tenantId) {
  return new NextRequest("http://localhost/api/business-hours", {
    method,
    headers: { "x-tenant-id": tenant, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

/** Seed pattern: Mon–Sat 09:00–18:00, no Sunday row. */
async function seedHours(id: string, opensAt = "09:00", closesAt = "18:00") {
  await db.businessHour.createMany({
    data: [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ tenantId: id, dayOfWeek, opensAt, closesAt })),
  });
}

function week(overrides: Record<number, Partial<BusinessHourRow>> = {}) {
  return [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
    dayOfWeek,
    opensAt: "09:00",
    closesAt: "18:00",
    isClosed: dayOfWeek === 0,
    ...overrides[dayOfWeek],
  }));
}

const storedRows = (id: string) =>
  db.businessHour.findMany({
    where: { tenantId: id },
    orderBy: { dayOfWeek: "asc" },
    select: { id: true, dayOfWeek: true, opensAt: true, closesAt: true, isClosed: true },
  });

beforeAll(async () => {
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
    stdio: "pipe",
  });
  for (const id of [tenantId, otherTenantId]) {
    await db.tenant.upsert({ where: { id }, update: {}, create: { id, slug: id, name: id } });
  }
});
beforeEach(async () => {
  requestHeaders.cookie = "";
  await db.businessHour.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await db.service.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await seedHours(tenantId);
  await seedHours(otherTenantId, "10:00", "16:00");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
afterAll(async () => {
  await db.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
  await db.$disconnect();
});

describe("GET /api/business-hours", () => {
  it("returns only the tenant's rows ordered by dayOfWeek", async () => {
    const res = await GET(request(undefined, "GET"));
    expect(res.status).toBe(200);
    const { hours } = await res.json();
    expect(hours).toEqual(await storedRows(tenantId));
    expect(hours.map((row: BusinessHourRow) => row.dayOfWeek)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(hours.every((row: BusinessHourRow) => row.opensAt === "09:00")).toBe(true);
  });

  it("requires a tenant", async () => {
    const res = await GET(new NextRequest("http://localhost/api/business-hours"));
    expect(res.status).toBe(400);
  });
});

describe("PUT /api/business-hours", () => {
  it("replaces the week by upserting so existing ids survive", async () => {
    const before = await storedRows(tenantId);
    const hours = week({
      0: { isClosed: false, opensAt: "11:00", closesAt: "15:00" },
      1: { opensAt: "12:00" },
    });
    const res = await PUT(request({ hours }));
    expect(res.status).toBe(200);
    const after = await storedRows(tenantId);
    expect(after).toHaveLength(7);
    expect((await res.json()).hours).toEqual(after);
    for (const row of before) {
      expect(after.find((r) => r.dayOfWeek === row.dayOfWeek)?.id).toBe(row.id);
    }
    expect(after[0]).toMatchObject({
      dayOfWeek: 0,
      opensAt: "11:00",
      closesAt: "15:00",
      isClosed: false,
    });
    expect(after[1]).toMatchObject({ dayOfWeek: 1, opensAt: "12:00", closesAt: "18:00" });
  });

  it("treats isClosed as closed regardless of its times", async () => {
    const hours = week({
      3: { isClosed: true, opensAt: "18:00", closesAt: "09:00" },
      4: { isClosed: true, opensAt: "nope", closesAt: undefined },
    });
    const res = await PUT(request({ hours }));
    expect(res.status).toBe(200);
    const after = await storedRows(tenantId);
    expect(after[3]).toMatchObject({ isClosed: true, opensAt: "18:00", closesAt: "09:00" });
    expect(after[4]).toMatchObject({ isClosed: true, opensAt: "09:00", closesAt: "18:00" });
  });

  it.each([
    ["opening after closing", week({ 3: { opensAt: "18:00", closesAt: "09:00" } })],
    ["opening equal to closing", week({ 3: { opensAt: "09:00", closesAt: "09:00" } })],
    ["single-digit hour", week({ 3: { opensAt: "9:00" } })],
    ["out-of-range hour", week({ 3: { closesAt: "24:00" } })],
    ["out-of-range minute", week({ 3: { closesAt: "17:60" } })],
    ["missing times on an open day", week({ 3: { opensAt: undefined } })],
    ["fewer than seven days", week().slice(0, 6)],
    ["a duplicated day", [...week().slice(0, 6), { ...week()[1] }]],
    ["day outside 0-6", [...week().slice(0, 6), { ...week()[6], dayOfWeek: 7 }]],
  ])("rejects %s with 422 and changes nothing", async (_label, hours) => {
    const before = await storedRows(tenantId);
    const res = await PUT(request({ hours }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("validation_failed");
    expect(await storedRows(tenantId)).toEqual(before);
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await PUT(
      new NextRequest("http://localhost/api/business-hours", {
        method: "PUT",
        headers: { "x-tenant-id": tenantId, "content-type": "application/json" },
        body: "{",
      })
    );
    expect(res.status).toBe(400);
  });

  it("only touches the requesting tenant's rows", async () => {
    const otherBefore = await storedRows(otherTenantId);
    expect((await PUT(request({ hours: week({ 3: { isClosed: true } }) }))).status).toBe(200);
    expect(await storedRows(otherTenantId)).toEqual(otherBefore);

    const otherGet = await (await GET(request(undefined, "GET", otherTenantId))).json();
    expect(otherGet.hours).toEqual(otherBefore);
    expect(otherGet.hours.every((row: BusinessHourRow) => row.opensAt === "10:00")).toBe(true);
  });

  it("returns 404 for an unknown tenant without creating rows", async () => {
    const res = await PUT(request({ hours: week() }, "PUT", "business-hours-missing"));
    expect(res.status).toBe(404);
    expect(await db.businessHour.count({ where: { tenantId: "business-hours-missing" } })).toBe(0);
  });
});

describe("settings form to public booking page", () => {
  it("saves Wednesday closed via the signed-in session, reloads it, and the booking page drops Wednesday", async () => {
    // 60-minute slots: nine per open day, so five open days stay under the page's 48-slot cap.
    const service = await db.service.create({
      data: { tenantId, name: "Haircut", durationMinutes: 60, priceCents: 1000 },
    });
    expect(await bookingPageSlotDays(service.id)).toEqual([1, 2, 3, 4, 5, 6]);

    vi.stubEnv("SESSION_SECRET", SECRET);
    const now = Date.now();
    const token = signSession({
      sub: "owner",
      phone: "+2348000000000",
      tenantId,
      iat: now,
      exp: now + 60 * 60 * 1000,
    });
    requestHeaders.cookie = `${SESSION_COOKIE_NAME}=${token}`;

    // Settings renders the seeded week with Sunday defaulted to closed.
    const initial = renderToStaticMarkup(await SettingsPage({}));
    expect(initial).not.toContain("not available yet");
    expect(closedDays(initial)).toEqual([0]);

    // The form's save goes through the real route with only the session cookie.
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) =>
      PUT(
        new NextRequest("http://localhost/api/business-hours", {
          method: init.method,
          body: init.body,
          headers: { "content-type": "application/json", cookie: requestHeaders.cookie },
        })
      )
    );
    const loaded = fillWeek(await storedRows(tenantId));
    const result = await saveBusinessHours(
      loaded.map((row) => (row.dayOfWeek === 3 ? { ...row, isClosed: true } : row))
    );
    expect(result.ok).toBe(true);

    // Reload.
    expect(closedDays(renderToStaticMarkup(await SettingsPage({})))).toEqual([0, 3]);

    expect(await bookingPageSlotDays(service.id)).toEqual([1, 2, 4, 5, 6]);
  });
});

/** Distinct UTC weekdays offered by /<slug>/book over the week starting Monday 2026-11-09. */
async function bookingPageSlotDays(serviceId: string): Promise<number[]> {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-09T00:00:00Z"));
  try {
    const html = renderToStaticMarkup(
      await PublicBookPage({ params: { slug: tenantId }, searchParams: { serviceId } })
    );
    const days = [...html.matchAll(/startsAt=([^&"]+)/g)].map((match) =>
      new Date(decodeURIComponent(match[1])).getUTCDay()
    );
    return [...new Set(days)].sort();
  } finally {
    vi.useRealTimers();
  }
}

function closedDays(html: string): number[] {
  return [...html.matchAll(/data-day-of-week="(\d)"[\s\S]*?<\/div>/g)]
    .filter((match) => /aria-label="\w+ closed" checked=""/.test(match[0]))
    .map((match) => Number(match[1]))
    .sort();
}
