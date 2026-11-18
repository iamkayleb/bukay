import { createHash } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";

/**
 * Merchant calendar — issue #545.
 *
 * Uses the seeded `demo` tenant and its pinned 2026-06-15 booking. OTP is
 * replaced the same way as `clients.spec.ts` so the browser can finish login.
 */

const db = new PrismaClient();
const DEMO_OWNER_PHONE = "+2348061778668";
const KNOWN_CODE = "246810";
const CALENDAR_DATE = "2026-06-15";

test.afterAll(async () => {
  await db.$disconnect();
});

async function signInAsDemoOwner(page: Page) {
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

test("[AC-5] a merchant cancels the seeded booking on /calendar and still sees cancelled after reload", async ({
  page,
}) => {
  page.on("dialog", (dialog) => dialog.accept());

  await signInAsDemoOwner(page);
  await page.goto(`/calendar?date=${CALENDAR_DATE}`);

  await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();
  const dayBookings = page.getByRole("list", { name: "Day bookings" });
  await expect(dayBookings.getByText("Demo Client")).toBeVisible();
  await expect(dayBookings.getByText("confirmed")).toBeVisible();

  await dayBookings.getByRole("button", { name: "Cancel" }).click();
  await expect(dayBookings.getByText("cancelled")).toBeVisible({ timeout: 10_000 });

  await page.reload();
  await expect(dayBookings.getByText("Demo Client")).toBeVisible();
  await expect(dayBookings.getByText("cancelled")).toBeVisible();
  await expect(dayBookings.getByText("confirmed")).toHaveCount(0);
});
