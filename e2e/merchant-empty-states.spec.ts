import { createHash, randomInt } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";

import { merchantEmptyActions, merchantEmptyMessages } from "../app/(app)/merchant-empty-copy";

/**
 * Merchant empty-state copy — issue #556.
 *
 * Fresh sign-in provisions a tenant with no bookings, so /calendar exercises
 * the real API + DayView path (not just static markup).
 */

const db = new PrismaClient();
const KNOWN_CODE = "246810";

test.afterAll(async () => {
  await db.$disconnect();
});

function freshMerchantPhone() {
  return `+23490${String(randomInt(0, 100_000_000)).padStart(8, "0")}`;
}

async function signIn(page: Page) {
  const phone = freshMerchantPhone();
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

test("fresh merchant sees calendar day empty copy with add-booking link", async ({ page }) => {
  await signIn(page);
  await page.goto("/calendar");

  await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();
  await expect(page.getByText("Loading bookings...")).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText(merchantEmptyMessages.calendarDay)).toBeVisible();
  await expect(
    page.getByRole("link", { name: merchantEmptyActions.calendarAddBooking })
  ).toBeVisible();
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
  await expect(
    page.getByRole("link", { name: merchantEmptyActions.todayAddOnCalendar })
  ).toBeVisible();
});
