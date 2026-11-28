import { createHash, randomInt } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";

import { dateInZone } from "@/app/lib/calendar";

/**
 * Merchant /today summary — issue #553.
 *
 * Proves the calendar → today journey: after creating a booking for the tenant's
 * current business day, the Today summary's booking count rises by one.
 */

const db = new PrismaClient();
const DEMO_OWNER_PHONE = "+2348061778668";
const KNOWN_CODE = "246810";
const DEMO_TIME_ZONE = "Africa/Lagos";

test.afterAll(async () => {
  await db.$disconnect();
});

function isSundayInLagos(now = new Date()) {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: DEMO_TIME_ZONE,
    weekday: "short",
  }).format(now);
  return weekday === "Sun";
}

async function signInAsDemoOwner(page: Page) {
  await db.otpCode.deleteMany({ where: { phone: DEMO_OWNER_PHONE } });
  await page.goto("/login");
  await page.locator('input[name="phone"]').fill(DEMO_OWNER_PHONE);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.locator('input[name="code"]')).toBeVisible();

  await db.otpCode.update({
    where: { phone: DEMO_OWNER_PHONE },
    data: {
      hash: createHash("sha256").update(`${DEMO_OWNER_PHONE}:${KNOWN_CODE}`).digest("hex"),
      attempts: 0,
    },
  });

  await page.locator('input[name="code"]').fill(KNOWN_CODE);
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
}

async function bookingsTodayCount(page: Page): Promise<number> {
  const dd = page
    .locator('[aria-label="Today summary"] div')
    .filter({ has: page.getByText("Bookings today", { exact: true }) });
  const value = await dd.locator("dd").textContent();
  const parsed = Number(value?.trim());
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected a numeric bookings count, got ${value ?? "nothing"}`);
  }
  return parsed;
}

/**
 * Classic Haircut uses 30-minute slots. The merchant API validates against UTC
 * midnights, so only try late-morning through afternoon times that stay valid.
 */
function randomClassicHaircutTime(): string {
  const starts: string[] = [];
  for (let hour = 10; hour <= 16; hour++) {
    for (const minute of [0, 30]) {
      starts.push(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
    }
  }
  return starts[randomInt(0, starts.length)]!;
}

test("[AC-5] creating a booking on /calendar increases Bookings today on /today", async ({
  page,
}) => {
  test.skip(isSundayInLagos(), "Demo business hours are closed on Sundays");

  const today = dateInZone(new Date(), DEMO_TIME_ZONE);

  await signInAsDemoOwner(page);
  await page.goto("/today");
  await expect(page.getByText("Bookings today")).toBeVisible();
  const before = await bookingsTodayCount(page);

  await page.goto("/calendar");
  await expect(page.getByRole("heading", { name: "New booking" })).toBeVisible();

  await page.locator('select[name="serviceId"]').selectOption({ label: "Classic Haircut" });
  await page.locator('input[name="date"]').fill(today);
  await page.getByRole("combobox", { name: "Client" }).selectOption({ label: "Demo Client" });

  const bookingForm = page
    .locator("form")
    .filter({ has: page.getByRole("heading", { name: "New booking" }) });
  let booked = false;
  for (let attempt = 0; attempt < 8 && !booked; attempt++) {
    await bookingForm.locator('input[name="time"]').fill(randomClassicHaircutTime());
    await bookingForm.getByRole("button", { name: "Create booking" }).click();
    const alert = bookingForm.getByRole("alert");
    if (await alert.isVisible().catch(() => false)) {
      const message = (await alert.textContent()) ?? "";
      if (
        message.includes("overlaps") ||
        message.includes("business hours") ||
        message.includes("available service slot")
      ) {
        continue;
      }
      throw new Error(message || "booking form error");
    }
    await expect(page).toHaveURL(new RegExp(`/calendar\\?date=${today.replace(/-/g, "\\-")}`), {
      timeout: 15_000,
    });
    booked = true;
  }
  expect(booked).toBe(true);

  await page.goto("/today");
  await expect(page.getByText("Bookings today")).toBeVisible();
  const after = await bookingsTodayCount(page);
  expect(after).toBe(before + 1);
});
