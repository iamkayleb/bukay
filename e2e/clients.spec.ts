import { createHash, randomInt } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";

/**
 * Merchant clients flow — issue #536.
 *
 * Signs in through the real login form. The OTP itself goes to an SMS provider
 * the browser cannot read, so after "Send code" the spec replaces the issued
 * code's hash with one for a code it knows. Everything after that — verify,
 * session cookie, tenant resolution — is the production path.
 *
 * Each test signs in with a fresh phone, which provisions a fresh tenant with no
 * clients. That keeps a CI retry from tripping the duplicate-phone 409.
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

async function addAda(page: Page) {
  await page.goto("/clients");
  await expect(page.getByRole("heading", { name: "Clients", exact: true })).toBeVisible();
  await page.locator('input[name="name"]').fill("Ada");
  await page.locator('input[name="phone"]').fill("08061778668");
  await page.getByRole("button", { name: "Add client" }).click();
  await expect(page.getByText("Client added.")).toBeVisible();
}

test("[AC-4] a merchant adds Ada on /clients and still sees her after reload", async ({ page }) => {
  await signIn(page);
  await addAda(page);

  // The reload is the criterion: a list that only reflects client state would
  // pass the step above and lose Ada here.
  await page.reload();
  const clients = page.getByRole("list", { name: "Clients" });
  await expect(clients.getByRole("link", { name: /Ada/ })).toBeVisible();
  await expect(clients.getByText("+2348061778668")).toBeVisible();
});

test("[AC-5] opening Ada from the list shows her empty booking history", async ({ page }) => {
  await signIn(page);
  await addAda(page);

  await page.getByRole("list", { name: "Clients" }).getByRole("link", { name: /Ada/ }).click();

  await expect(page).toHaveURL(/\/clients\/[a-z0-9]+$/);
  await expect(page.getByRole("heading", { name: "Ada" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Booking history" })).toBeVisible();
  await expect(page.getByText("Ada has no bookings yet.")).toBeVisible();
});
