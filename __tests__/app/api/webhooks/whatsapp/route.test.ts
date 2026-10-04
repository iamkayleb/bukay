import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "wa_app_secret";
const BUSINESS = "+2348011111111";
const SENDER = "+2348022222222";

type Row = Record<string, any>;

const db = vi.hoisted(() => {
  const state = {
    tenants: [] as Row[],
    clients: [] as Row[],
    conversations: [] as Row[],
    messages: [] as Row[],
    deadLetters: [] as Row[],
    seq: 0,
  };
  const matches = (row: Row, where: Row = {}) =>
    Object.entries(where).every(([k, v]) => row[k] === v);
  const id = () => `id-${++state.seq}`;
  const table = (rows: () => Row[]) => ({
    findFirst: async ({ where }: { where: Row }) => rows().find((r) => matches(r, where)) ?? null,
    create: async ({ data }: { data: Row }) => {
      const row = { id: id(), greetedAt: null, clientId: null, ...data };
      rows().push(row);
      return row;
    },
    update: async ({ where, data }: { where: Row; data: Row }) => {
      const row = rows().find((r) => matches(r, where))!;
      Object.assign(row, data);
      return row;
    },
  });
  return {
    state,
    prisma: {
      tenant: table(() => state.tenants),
      client: table(() => state.clients),
      conversation: table(() => state.conversations),
      message: table(() => state.messages),
      deadLetterEvent: table(() => state.deadLetters),
    },
  };
});

const provider = vi.hoisted(() => ({ sendTemplate: vi.fn() }));

vi.mock("@/app/db/prisma", () => ({ prisma: db.prisma }));
vi.mock("@/app/lib/whatsapp/meta", () => ({ metaWhatsAppFromEnv: () => provider }));

import { GET, POST } from "@/app/api/webhooks/whatsapp/route";

function payload(opts: { from?: string; to?: string; id?: string; text?: string } = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { display_phone_number: (opts.to ?? BUSINESS).replace("+", "") },
              messages: [
                {
                  id: opts.id ?? "wamid.1",
                  from: (opts.from ?? SENDER).replace("+", ""),
                  type: "text",
                  text: { body: opts.text ?? "hello" },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function request(body: unknown, signature?: string) {
  const raw = JSON.stringify(body);
  const sig = signature ?? `sha256=${createHmac("sha256", SECRET).update(raw).digest("hex")}`;
  return new NextRequest("http://app.test/api/webhooks/whatsapp", {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": sig },
    body: raw,
  });
}

beforeEach(() => {
  process.env.WHATSAPP_APP_SECRET = SECRET;
  process.env.WHATSAPP_VERIFY_TOKEN = "verify-me";
  Object.assign(db.state, {
    tenants: [{ id: "t1", name: "Salon One", whatsappNumber: BUSINESS, active: true }],
    clients: [],
    conversations: [],
    messages: [],
    deadLetters: [],
    seq: 0,
  });
  provider.sendTemplate.mockReset();
  provider.sendTemplate.mockResolvedValue({
    id: "wamid.out",
    provider: "fake",
    to: SENDER,
    status: 200,
  });
});

describe("WhatsApp inbound webhook", () => {
  it("persists an inbound message with the routed tenantId", async () => {
    const res = await POST(request(payload()));
    expect(res.status).toBe(200);
    expect(db.state.conversations).toHaveLength(1);
    const inbound = db.state.messages.find((m) => m.direction === "inbound")!;
    expect(inbound).toMatchObject({
      tenantId: "t1",
      providerMessageId: "wamid.1",
      body: "hello",
      conversationId: db.state.conversations[0].id,
    });
  });

  it("greets an unknown number once and returns 200", async () => {
    const res = await POST(request(payload()));
    expect(res.status).toBe(200);
    expect(provider.sendTemplate).toHaveBeenCalledWith({
      to: SENDER,
      template: "greeting",
      params: { businessName: "Salon One" },
    });
    expect(db.state.messages.filter((m) => m.direction === "outbound")).toHaveLength(1);

    await POST(request(payload({ id: "wamid.2" })));
    expect(provider.sendTemplate).toHaveBeenCalledTimes(1);
  });

  it("still returns 200 and keeps the message when the greeting fails", async () => {
    provider.sendTemplate.mockRejectedValue(new Error("meta down"));
    const res = await POST(request(payload()));
    expect(res.status).toBe(200);
    expect(db.state.messages.filter((m) => m.direction === "inbound")).toHaveLength(1);
    expect(db.state.conversations[0].greetedAt).toBeNull();
  });

  it("resumes a known client without greeting", async () => {
    db.state.clients.push({ id: "c1", tenantId: "t1", phone: SENDER, name: "Ada" });
    const res = await POST(request(payload()));
    expect(res.status).toBe(200);
    expect(provider.sendTemplate).not.toHaveBeenCalled();
    expect(db.state.conversations[0].clientId).toBe("c1");
  });

  it("does not persist a redelivered message twice", async () => {
    await POST(request(payload()));
    await POST(request(payload()));
    expect(db.state.messages.filter((m) => m.direction === "inbound")).toHaveLength(1);
  });

  it("scopes a client match to the routed tenant", async () => {
    db.state.clients.push({ id: "c9", tenantId: "other", phone: SENDER, name: "Eve" });
    await POST(request(payload()));
    expect(db.state.conversations[0].clientId).toBeNull();
    expect(provider.sendTemplate).toHaveBeenCalledTimes(1);
  });

  it("dead-letters messages for an unrouted business number with 200", async () => {
    const res = await POST(request(payload({ to: "+2349099999999" })));
    expect(res.status).toBe(200);
    expect(db.state.messages).toHaveLength(0);
    expect(db.state.deadLetters[0].reason).toBe("unknown_business_number");
  });

  it("rejects bad signatures and malformed bodies", async () => {
    expect((await POST(request(payload(), "sha256=bad"))).status).toBe(401);
    const raw = "not json";
    const sig = `sha256=${createHmac("sha256", SECRET).update(raw).digest("hex")}`;
    const res = await POST(
      new NextRequest("http://app.test/api/webhooks/whatsapp", {
        method: "POST",
        headers: { "x-hub-signature-256": sig },
        body: raw,
      })
    );
    expect(res.status).toBe(400);
  });

  it("answers the Meta verification handshake", async () => {
    const ok = await GET(
      new NextRequest(
        "http://app.test/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=42"
      )
    );
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("42");
    const bad = await GET(
      new NextRequest("http://app.test/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=x")
    );
    expect(bad.status).toBe(403);
  });
});
