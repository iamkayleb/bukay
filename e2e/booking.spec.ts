import { expect, test } from "@playwright/test";

/**
 * Public booking flow — the journey a client actually takes.
 *
 * Each test tags the acceptance criterion it proves. CI turns those tags into
 * a per-criterion table the verifier reads, so a criterion like "the booking
 * page shows available slots" stops being something a person has to perform.
 *
 * These run against the seeded `demo` tenant: three services, business hours
 * Mon–Sat 09:00–18:00, Sunday closed. A run against an empty database would
 * exercise the empty state and nothing else, which is why the CI lane seeds
 * before it starts the app.
 */

const SLUG = "demo";

/** Step 2 lists each free slot as a link labelled like "Tue, 17 Nov, 16:30". */
const SLOT_LINK = /\d{1,2}\s\w{3},\s\d{2}:\d{2}$/;

test("[AC-1] the booking page lists the tenant's services with prices", async ({ page }) => {
  await page.goto(`/${SLUG}/book`);

  await expect(page.getByRole("heading", { name: "Book an appointment" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "1. Choose a service" })).toBeVisible();

  // The seeded services, by name. Asserting on the seed rather than on a count
  // keeps this from passing against whatever happens to be in the database.
  for (const service of ["Classic Haircut", "Beard Trim", "Full Grooming Package"]) {
    await expect(page.getByRole("heading", { name: service })).toBeVisible();
  }

  // A price is what makes the list usable; a service with none is a stub.
  await expect(page.getByText("₦50", { exact: false }).first()).toBeVisible();
});

test("[AC-2] choosing a service offers bookable times", async ({ page }) => {
  await page.goto(`/${SLUG}/book`);
  await page.getByRole("link", { name: /Classic Haircut/ }).click();

  await expect(page.getByRole("heading", { name: "2. Pick a time" })).toBeVisible();

  // The criterion that four months of automated rounds never checked: that a
  // client is actually offered something to book. A page that renders the
  // heading and no slots satisfied every file-existence measure and could not
  // be used.
  const slots = page.getByRole("link", { name: SLOT_LINK });
  await expect(slots.first()).toBeVisible();
  expect(await slots.count()).toBeGreaterThan(0);
});

test("[AC-3] a client can complete a booking and reach confirmation", async ({ page }) => {
  await page.goto(`/${SLUG}/book`);
  await page.getByRole("link", { name: /Classic Haircut/ }).click();
  await page.getByRole("link", { name: SLOT_LINK }).first().click();

  await expect(page.getByRole("heading", { name: /3\./ })).toBeVisible();

  await page.locator('input[name="customerName"]').fill("Playwright Client");
  await page.locator('input[name="phone"]').fill("+2348000000111");
  await page.getByRole("button", { name: /confirm|book/i }).click();

  // The flow confirms in place: it redirects back to the booking route with
  // `done=1` and the new booking's id, and renders "Booking reserved" with a
  // reference. Note there is also an app/[slug]/book/confirmed/ route; it is
  // not part of this journey and answers 400, so asserting on it would have
  // failed against a booking that in fact succeeded.
  await expect(page).toHaveURL(/[?&]done=1(&|$)/, { timeout: 15_000 });
  await expect(page).toHaveURL(/[?&]bookingId=[a-z0-9]+/);

  // A redirect alone does not prove a client was told anything.
  await expect(page.getByRole("heading", { name: /booking reserved/i })).toBeVisible();
  await expect(page.getByText(/Reference:/)).toBeVisible();
});

test("[AC-4] an unknown tenant does not render a bookable page", async ({ page }) => {
  // A booking form for a business that does not exist takes a real client's
  // details and has nowhere to send them.
  const response = await page.goto(`/${SLUG}-does-not-exist/book`);

  expect(response?.status()).toBeGreaterThanOrEqual(400);
  await expect(page.getByRole("heading", { name: "1. Choose a service" })).toHaveCount(0);
});
