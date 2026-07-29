import { createHmac } from "node:crypto";
import { expect, test, type BrowserContext } from "@playwright/test";

const SESSION_COOKIE_NAME = "bukay_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_KEY = process.env.SESSION_SECRET ?? "visual-regression-session-key";
const PLAYWRIGHT_PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3000);
const APP_URL = `http://127.0.0.1:${PLAYWRIGHT_PORT}`;

function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function signSession(payload: Record<string, unknown>): string {
  const body = b64urlEncode(Buffer.from(JSON.stringify(payload)));
  const sig = createHmac("sha256", SESSION_KEY).update(body).digest();
  return `${body}.${b64urlEncode(sig)}`;
}

async function addAuthenticatedSession(context: BrowserContext) {
  const now = Date.now();
  const token = signSession({
    sub: "visual-user",
    phone: "+2348012345678",
    tenantId: "visual-tenant",
    tenantSlug: "visual-workspace",
    iat: now,
    exp: now + SESSION_TTL_MS,
  });

  await context.addCookies([
    {
      name: SESSION_COOKIE_NAME,
      value: token,
      url: APP_URL,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

test.describe("authenticated app layout visual regression", () => {
  test.beforeEach(async ({ context }) => {
    await addAuthenticatedSession(context);
  });

  test("matches the desktop authenticated shell baseline", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/today");
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    await expect(page.getByTestId("tenant-name")).toHaveText("visual-workspace");

    await expect(page).toHaveScreenshot("app-layout-desktop.png", {
      animations: "disabled",
      fullPage: true,
    });
  });

  test("matches the mobile authenticated shell baseline with the drawer open", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/today");
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();

    await page.getByRole("button", { name: "Open navigation menu" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await expect(page).toHaveScreenshot("app-layout-mobile-drawer.png", {
      animations: "disabled",
      fullPage: true,
    });
  });
});
