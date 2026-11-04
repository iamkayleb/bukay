import { execFileSync } from "node:child_process";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/app/db/prisma";
import { BOOKING_AGENT_SYSTEM_PROMPT } from "@/app/lib/agent/prompt";
import { createBookingAgent, createDefaultToolRegistry } from "@/app/lib/agent/runtime";
import type { TurnPlanner } from "@/app/lib/agent/types";
import {
  AGENT_HOLD_TTL_MS,
  CREATE_BOOKING_TOOL_NAME,
  releaseUnpaidHolds,
} from "@/app/lib/agent/tools/book";
import { LOOKUP_AVAILABILITY_TOOL_NAME } from "@/app/lib/agent/tools/availability";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";

const DAY = "2026-07-27";
const RANGE_FROM = `${DAY}T00:00:00.000Z`;
const RANGE_TO = "2026-07-28T00:00:00.000Z";
const SLOT_START = `${DAY}T10:00:00.000Z`;
const T0 = new Date(`${DAY}T08:00:00.000Z`);

type Seed = {
  tenantId: string;
  otherTenantId: string;
  serviceId: string;
};

let seed: Seed;

function applyMigrations() {
  const prismaBin = path.join(process.cwd(), "node_modules", ".bin", "prisma");
  execFileSync(prismaBin, ["migrate", "deploy"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "pipe",
  });
}

async function resetTenant(tenantId: string) {
  await runWithTenantContext({ tenantId }, async () => {
    await prisma.slotHold.deleteMany({ where: { tenantId } });
    await prisma.payment.deleteMany({ where: { tenantId } });
    await prisma.booking.deleteMany({ where: { tenantId } });
    await prisma.client.deleteMany({ where: { tenantId } });
  });
}

async function ensureSeed(): Promise<Seed> {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "agent-booking-demo" },
    update: { name: "Agent Booking Salon", timezone: "Africa/Lagos", currency: "NGN" },
    create: {
      slug: "agent-booking-demo",
      name: "Agent Booking Salon",
      timezone: "Africa/Lagos",
      currency: "NGN",
    },
  });

  const other = await prisma.tenant.upsert({
    where: { slug: "agent-booking-other" },
    update: { name: "Other Tenant", timezone: "Africa/Lagos", currency: "NGN" },
    create: {
      slug: "agent-booking-other",
      name: "Other Tenant",
      timezone: "Africa/Lagos",
      currency: "NGN",
    },
  });

  const dayOfWeek = new Date(SLOT_START).getUTCDay();
  await runWithTenantContext({ tenantId: tenant.id }, async () => {
    const existing = await prisma.service.findFirst({
      where: { tenantId: tenant.id, name: "Classic Haircut" },
    });
    const service =
      existing ??
      (await prisma.service.create({
        data: {
          tenantId: tenant.id,
          name: "Classic Haircut",
          description: "Agent booking test service",
          durationMinutes: 30,
          priceCents: 5000,
          currency: "NGN",
          active: true,
        },
      }));

    const existingHour = await prisma.businessHour.findFirst({
      where: { tenantId: tenant.id, dayOfWeek },
    });
    if (existingHour) {
      await prisma.businessHour.updateMany({
        where: { tenantId: tenant.id, id: existingHour.id },
        data: { opensAt: "09:00", closesAt: "17:00", isClosed: false },
      });
    } else {
      await prisma.businessHour.create({
        data: {
          tenantId: tenant.id,
          dayOfWeek,
          opensAt: "09:00",
          closesAt: "17:00",
          isClosed: false,
        },
      });
    }

    return service;
  });

  const service = await runWithTenantContext({ tenantId: tenant.id }, () =>
    prisma.service.findFirstOrThrow({
      where: { tenantId: tenant.id, name: "Classic Haircut" },
    })
  );

  return { tenantId: tenant.id, otherTenantId: other.id, serviceId: service.id };
}

type ToolPayload = {
  status: number;
  ok: boolean;
  data?: {
    slots?: Array<{ startsAt: string; endsAt: string }>;
    booking?: { id: string; status: string; startsAt: string };
    holdExpiresAt?: string;
    confirmed?: boolean;
  };
  error?: string;
};

function scriptedPlanner(): TurnPlanner {
  return ({ messages }) => {
    const toolMessages = messages.filter((message) => message.role === "tool");
    const lastUser = [...messages].reverse().find((message) => message.role === "user");
    const availability = toolMessages.find(
      (message) => message.name === LOOKUP_AVAILABILITY_TOOL_NAME
    );
    const holds = toolMessages.filter((message) => message.name === CREATE_BOOKING_TOOL_NAME);

    if (!availability) {
      return {
        toolCalls: [
          {
            name: LOOKUP_AVAILABILITY_TOOL_NAME,
            arguments: {
              serviceId: seed.serviceId,
              from: RANGE_FROM,
              to: RANGE_TO,
            },
          },
        ],
      };
    }

    if (holds.length === 0) {
      const parsed = JSON.parse(availability.content) as ToolPayload;
      const slot = parsed.data?.slots?.find((item) => item.startsAt === SLOT_START);
      if (!slot) {
        return { content: "That time is not available." };
      }
      return {
        toolCalls: [
          {
            name: CREATE_BOOKING_TOOL_NAME,
            arguments: {
              serviceId: seed.serviceId,
              startsAt: slot.startsAt,
              customerName: "Ada Okonkwo",
              phone: "08031234567",
            },
          },
        ],
      };
    }

    if (holds.length === 1 && lastUser && /confirm/i.test(lastUser.content)) {
      const parsed = JSON.parse(holds[0].content) as ToolPayload;
      return {
        toolCalls: [
          {
            name: CREATE_BOOKING_TOOL_NAME,
            arguments: {
              confirm: true,
              bookingId: parsed.data?.booking?.id,
            },
          },
        ],
      };
    }

    if (holds.length === 1) {
      return {
        content: "I held that slot for 15 minutes. Reply confirm to book it.",
      };
    }

    return { content: `Your booking is confirmed for ${SLOT_START}.` };
  };
}

beforeAll(async () => {
  applyMigrations();
  seed = await ensureSeed();
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetTenant(seed.tenantId);
  await resetTenant(seed.otherTenantId);
});

describe("booking agent happy path", () => {
  it("the scripted conversation reaches a confirmed booking", async () => {
    const agent = createBookingAgent({
      tenantId: seed.tenantId,
      conversationId: "conv-happy",
      now: () => T0,
      planner: scriptedPlanner(),
    });

    expect(agent.transcript[0]).toEqual({
      role: "system",
      content: BOOKING_AGENT_SYSTEM_PROMPT,
    });

    const heldReply = await agent.send(
      "I'd like a Classic Haircut on 2026-07-27 at 10:00. I'm Ada Okonkwo, 08031234567."
    );
    expect(heldReply).toMatch(/15 minutes/i);

    const confirmedReply = await agent.send("Yes, please confirm the booking.");
    expect(confirmedReply).toMatch(/confirmed/i);

    const booking = await runWithTenantContext({ tenantId: seed.tenantId }, () =>
      prisma.booking.findFirst({
        where: { tenantId: seed.tenantId, startsAt: new Date(SLOT_START) },
      })
    );
    expect(booking?.status).toBe("confirmed");

    const hold = await runWithTenantContext({ tenantId: seed.tenantId }, () =>
      prisma.slotHold.findFirst({
        where: {
          tenantId: seed.tenantId,
          serviceId: seed.serviceId,
          startsAt: new Date(SLOT_START),
        },
      })
    );
    expect(hold).toBeNull();
  });

  it("a tool call for another tenant returns HTTP 403", async () => {
    const registry = createDefaultToolRegistry();
    const context = {
      tenantId: seed.tenantId,
      conversationId: "conv-forbidden",
      now: T0,
    };

    const availability = await registry.call(
      LOOKUP_AVAILABILITY_TOOL_NAME,
      {
        tenantId: seed.otherTenantId,
        serviceId: seed.serviceId,
        from: RANGE_FROM,
        to: RANGE_TO,
      },
      context
    );
    expect(availability.status).toBe(403);
    expect(availability.ok).toBe(false);

    const booking = await registry.call(
      CREATE_BOOKING_TOOL_NAME,
      {
        tenantId: seed.otherTenantId,
        serviceId: seed.serviceId,
        startsAt: SLOT_START,
        customerName: "Ada Okonkwo",
        phone: "08031234567",
      },
      context
    );
    expect(booking.status).toBe(403);

    const rows = await runWithTenantContext({ tenantId: seed.tenantId }, () =>
      prisma.booking.findMany({ where: { tenantId: seed.tenantId } })
    );
    expect(rows).toHaveLength(0);
  });

  it("an unpaid hold releases after 15 minutes", async () => {
    const registry = createDefaultToolRegistry();
    const held = await registry.call(
      CREATE_BOOKING_TOOL_NAME,
      {
        serviceId: seed.serviceId,
        startsAt: SLOT_START,
        customerName: "Ada Okonkwo",
        phone: "08031234567",
      },
      { tenantId: seed.tenantId, conversationId: "conv-hold", now: T0 }
    );

    expect(held.status).toBe(201);
    const holdExpiresAt = new Date((held.data as { holdExpiresAt: string }).holdExpiresAt);
    expect(holdExpiresAt.getTime() - T0.getTime()).toBe(AGENT_HOLD_TTL_MS);
    expect(AGENT_HOLD_TTL_MS).toBe(15 * 60 * 1000);

    const stillHeld = await releaseUnpaidHolds(
      seed.tenantId,
      new Date(T0.getTime() + AGENT_HOLD_TTL_MS - 1)
    );
    expect(stillHeld).toBe(0);

    const active = await runWithTenantContext({ tenantId: seed.tenantId }, () =>
      prisma.slotHold.findFirst({
        where: {
          tenantId: seed.tenantId,
          serviceId: seed.serviceId,
          startsAt: new Date(SLOT_START),
        },
      })
    );
    expect(active).not.toBeNull();

    const released = await releaseUnpaidHolds(
      seed.tenantId,
      new Date(T0.getTime() + AGENT_HOLD_TTL_MS)
    );
    expect(released).toBe(1);

    const gone = await runWithTenantContext({ tenantId: seed.tenantId }, () =>
      prisma.slotHold.findFirst({
        where: {
          tenantId: seed.tenantId,
          serviceId: seed.serviceId,
          startsAt: new Date(SLOT_START),
        },
      })
    );
    expect(gone).toBeNull();

    const booking = await runWithTenantContext({ tenantId: seed.tenantId }, () =>
      prisma.booking.findFirst({
        where: { tenantId: seed.tenantId, startsAt: new Date(SLOT_START) },
      })
    );
    expect(booking?.status).toBe("cancelled");
  });
});
