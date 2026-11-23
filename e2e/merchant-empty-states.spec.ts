import { createHash, randomInt } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";

import {
  merchantEmptyActions,
  merchantEmptyHrefs,
  merchantEmptyMessages,
} from "../app/(app)/merchant-empty-copy";

/**
 * Merchant empty-state copy — issue #556.
 *
 * Fresh sign-in provisions a tenant with no bookings, so /calendar exercises
 * the real API + DayView path (not just static markup).
 */

const db = new PrismaClient();
const DEMO_OWNER_PHONE = "+2348061778668";
const KNOWN_CODE = "246810";
const CALENDAR_DATE = "2026-06-15";

test.afterAll(async () => {
  await db.$disconnect();
});

function freshMerchantPhone() {
  return `+23490${String(randomInt(0, 100_000_000)).padStart(8, "0")}`;
}

async function signInWithPhone(page: Page, phone: string) {
  await page.goto("/login");
  await page.locator('input[name="phone"]').fill(phone);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.locator('input[name="code"]')).toBeVisible();

  await db.otpCode.update({
    where: { phone },
    data: {
      hash: createHash("sha256").update(`${phone}:${KNOWN_CODE}`).digest("hex"),
      attempts: 0,
    },
  });

  await page.locator('input[name="code"]').fill(KNOWN_CODE);
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
}

async function signIn(page: Page) {
  await signInWithPhone(page, freshMerchantPhone());
}

async function signInAsDemoOwner(page: Page) {
  await signInWithPhone(page, DEMO_OWNER_PHONE);
}

test("fresh merchant sees calendar day empty copy with add-booking link", async ({ page }) => {
  await signIn(page);
  await page.goto("/calendar");

  await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();
  await expect(page.getByText("Loading bookings...")).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText(merchantEmptyMessages.calendarDay)).toBeVisible();
  const addBookingLink = page.getByRole("link", { name: merchantEmptyActions.calendarAddBooking });
  await expect(addBookingLink).toBeVisible();
  await expect(addBookingLink).toHaveAttribute("href", merchantEmptyHrefs.calendarAddBooking);
  await addBookingLink.click();
  await expect(page.locator("#new-booking")).toBeVisible();
  await expect(page.getByRole("heading", { name: "New booking" })).toBeVisible();
});

test("fresh merchant sees clients empty copy before adding anyone", async ({ page }) => {
  await signIn(page);
  await page.goto("/clients");

  await expect(page.getByRole("heading", { name: "Clients", exact: true })).toBeVisible();
  await expect(page.getByText(merchantEmptyMessages.clients)).toBeVisible();
});

test("fresh merchant sees empty copy on services, payments, and today", async ({ page }) => {
  await signIn(page);

  await page.goto("/services");
  await expect(page.getByText(merchantEmptyMessages.services)).toBeVisible();

  await page.goto("/payments");
  await expect(page.getByText(merchantEmptyMessages.payments)).toBeVisible();

  await page.goto("/today");
  await expect(page.getByText(merchantEmptyMessages.today)).toBeVisible();
  const todayCalendarLink = page.getByRole("link", {
    name: merchantEmptyActions.todayAddOnCalendar,
  });
  await expect(todayCalendarLink).toBeVisible();
  await expect(todayCalendarLink).toHaveAttribute("href", merchantEmptyHrefs.todayCalendar);
});

test("seeded demo tenant does not show merchant empty copy on populated screens", async ({
  page,
}) => {
  await signInAsDemoOwner(page);

  await page.goto(`/calendar?date=${CALENDAR_DATE}`);
  await expect(page.getByText("Loading bookings...")).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText(merchantEmptyMessages.calendarDay)).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Day bookings" })).toBeVisible();

  // Today is omitted: the seed pins one booking to CALENDAR_DATE, not necessarily wall-clock today.
  for (const path of ["/clients", "/services", "/payments"] as const) {
    await page.goto(path);
    for (const message of Object.values(merchantEmptyMessages)) {
      await expect(page.getByText(message, { exact: false })).toHaveCount(0);
    }
  }
});
