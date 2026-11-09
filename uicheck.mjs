/**
 * Helper for checking a UI acceptance criterion by hand.
 *
 *   node uicheck.mjs                      what the seeded data says you should see
 *   node uicheck.mjs 08000000001          also recover the current sign-in code
 *   node uicheck.mjs --link 08061778668   give the demo owner a phone so you
 *                                         can sign in as them and see the
 *                                         seeded booking
 *
 * Run it from the bukay repository root, after `pnpm db:seed`.
 *
 * Why this exists: the round-spec rule says a UI round needs an acceptance
 * criterion a person performs. That rule is worth nothing if performing it is
 * so awkward that nobody does — which is how three lanes shipped a sign-in
 * page with no form on it. This removes the two obstacles: knowing what the
 * seeded data should look like, and getting past an OTP you cannot read.
 */
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";

const prisma = new PrismaClient();

// Matches app/lib/auth/otp.ts — the code is never stored, only this digest.
const digest = (phone, code) => createHash("sha256").update(`${phone}:${code}`).digest("hex");

function normalise(input) {
  const digits = String(input).replace(/\D/g, "");
  if (digits.startsWith("234")) return `+${digits}`;
  if (digits.startsWith("0")) return `+234${digits.slice(1)}`;
  return `+${digits}`;
}

function recover(phone, hash) {
  for (let i = 0; i < 1_000_000; i++) {
    const code = String(i).padStart(6, "0");
    if (digest(phone, code) === hash) return code;
  }
  return null;
}

const fmt = (d, tz) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "demo" } });
  if (!tenant) {
    console.log("No tenant with slug 'demo'. Run `pnpm db:seed` first.");
    return;
  }
  const tz = tenant.timezone?.trim() || "Africa/Lagos";
  console.log(`tenant    ${tenant.name}  (/${tenant.slug})   timezone ${tz}\n`);

  const bookings = await prisma.booking.findMany({
    where: { tenantId: tenant.id },
    orderBy: { startsAt: "asc" },
    include: { client: true, service: true },
  });

  if (!bookings.length) {
    console.log("No bookings seeded — nothing for /calendar to show.");
  } else {
    console.log("What /calendar should show, and on which date:\n");
    for (const b of bookings) {
      console.log(`  date to pick : ${fmt(b.startsAt, tz)}`);
      console.log(`  client name  : ${b.client?.name ?? "(none)"}`);
      console.log(`  service name : ${b.service?.name ?? "(none)"}`);
      console.log(`  status       : ${b.status}`);
      console.log(`  (ISO ${b.startsAt.toISOString()})\n`);
    }
    console.log("Note the date. The seed uses a fixed day, so today's view is");
    console.log("correctly empty — an empty calendar is not a failed round.\n");
  }

  const owners = await prisma.user.findMany({
    where: { tenantId: tenant.id },
    select: { phone: true, email: true, role: true },
  });
  console.log("Sign in as one of:");
  for (const u of owners) {
    console.log(`  ${u.phone ?? "(no phone)"}   ${u.email}  [${u.role}]`);
  }

  // The seed gives the demo owner an email but no phone, and sign-in is
  // phone-only — so nobody can sign in as the tenant that owns the seeded
  // data. Signing in with a fresh number creates a new, empty tenant instead,
  // which makes "a merchant opens /calendar and sees the booking" impossible
  // to perform. This links a number to the existing owner so it can be.
  if (process.argv[2] === "--link") {
    const phone = normalise(process.argv[3] ?? "");
    if (phone.length < 8) {
      console.log("\nUsage: node uicheck.mjs --link 08061778668");
      return;
    }
    const owner = await prisma.user.findFirst({
      where: { tenantId: tenant.id, role: "owner" },
    });
    if (!owner) {
      console.log("\nNo owner on the demo tenant.");
      return;
    }
    await prisma.user.update({ where: { id: owner.id }, data: { phone } });
    console.log(`\nLinked ${phone} to ${owner.email}.`);
    console.log("Now sign in at /login with that number, request a code, and");
    console.log(`run  node uicheck.mjs ${process.argv[3]}  to read it.`);
    return;
  }

  const arg = process.argv[2];
  if (!arg) {
    console.log("\nRequest a code at /login, then re-run with the phone number");
    console.log("to recover it, e.g.  node uicheck.mjs 08000000001");
    return;
  }

  const phone = normalise(arg);
  const row = await prisma.otpCode.findUnique({ where: { phone } });
  if (!row) {
    console.log(`\nNo code outstanding for ${phone}. Request one at /login first.`);
    return;
  }
  if (row.expiresAt < new Date()) {
    console.log(`\nThe code for ${phone} expired at ${row.expiresAt.toISOString()}.`);
    console.log("Request a fresh one.");
    return;
  }
  process.stdout.write(`\nrecovering the code for ${phone}... `);
  const code = recover(phone, row.hash);
  console.log(code ? `\n\n  CODE: ${code}\n` : "\n\n  not found — the hashing may have changed.\n");
}

main()
  .catch((e) => {
    console.error(e.message || e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
