import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";

import { GET, POST } from "@/app/api/webhooks/whatsapp/route";
import { FakeWhatsAppProvider } from "@/app/lib/whatsapp/fake";
import {
  __setWhatsAppInboundDepsForTests,
  signWhatsAppBody,
  type ClientRow,
  type ConversationRow,
  type MessageRow,
  type WhatsAppInboundDb,
} from "@/app/lib/whatsapp/inbound";
import type { TenantByNumber } from "@/app/lib/whatsapp/routing";

const SECRET = "whatsapp_app_secret_for_tests_0001";
const VERIFY_TOKEN = "bukay-verify-token";

type Store = {
  tenants: TenantByNumber[];
  clients: ClientRow[];
  conversations: ConversationRow[];
  messages: MessageRow[];
};

function createDb(seed?: Partial<Store>): { db: WhatsAppInboundDb; store: Store } {
  const store: Store = {
    tenants: seed?.tenants ?? [],
    clients: seed?.clients ?? [],
    conversations: seed?.conversations ?? [],
    messages: seed?.messages ?? [],
  };
  let seq = 0;
  const nextId = (prefix: string) => {
    seq += 1;
    return `${prefix}-${seq}`;
  };

  const db: WhatsAppInboundDb = {
    tenant: {
      findFirst: async ({ where }) =>
        store.tenants.find((tenant) => tenant.whatsappNumber === where.whatsappNumber) ?? null,
    },
    client: {
      findFirst: async ({ where }) =>
        store.clients.find(
          (client) => client.tenantId === where.tenantId && client.phone === where.phone
        ) ?? null,
    },
    conversation: {
      findFirst: async ({ where }) =>
        store.conversations.find(
          (row) => row.tenantId === where.tenantId && row.customerPhone === where.customerPhone
        ) ?? null,
      create: async ({ data }) => {
        const row: ConversationRow = { id: nextId("conv"), ...data };
        store.conversations.push(row);
        return row;
      },
      update: async ({ where, data }) => {
        const row = store.conversations.find(
          (item) => item.id === where.id && item.tenantId === where.tenantId
        );
        if (!row) throw new Error("conversation not found");
        row.clientId = data.clientId;
        return row;
      },
    },
    message: {
      findFirst: async ({ where }) =>
        store.messages.find((row) => row.externalId === where.externalId) ?? null,
      create: async ({ data }) => {
        const row: MessageRow = { id: nextId("msg"), ...data, externalId: data.externalId ?? null };
        store.messages.push(row);
        return row;
      },
    },
  };

  return { db, store };
}

function payload(options: { displayPhone: string; from: string; id: string; text: string }) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba-1",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: options.displayPhone,
                phone_number_id: "106540352242922",
              },
              messages: [
                {
                  from: options.from,
                  id: options.id,
                  timestamp: "1669233778",
                  type: "text",
                  text: { body: options.text },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function signedPost(body: unknown, secret = SECRET) {
  const raw = JSON.stringify(body);
  return new NextRequest("http://app.test/api/webhooks/whatsapp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": signWhatsAppBody(raw, secret),
    },
    body: raw,
  });
}

afterEach(() => {
  __setWhatsAppInboundDepsForTests(null);
});

describe("WhatsApp inbound webhook", () => {
  it("persists an inbound message with the tenant that owns the business number", async () => {
    const provider = new FakeWhatsAppProvider();
    const { db, store } = createDb({
      tenants: [
        { id: "tenant-ada", name: "Ada Salon", whatsappNumber: "2348099990001" },
        { id: "tenant-bayo", name: "Bayo Barbers", whatsappNumber: "2348088880002" },
      ],
    });
    __setWhatsAppInboundDepsForTests({
      db,
      provider,
      appSecret: SECRET,
      verifyToken: VERIFY_TOKEN,
    });

    const response = await POST(
      signedPost(
        payload({
          displayPhone: "+234 809 999 0001",
          from: "2348090001111",
          id: "wamid.inbound.1",
          text: "Hello",
        })
      )
    );

    expect(response.status).toBe(200);
    const inbound = store.messages.filter((message) => message.direction === "inbound");
    expect(inbound).toHaveLength(1);
    expect(inbound[0]).toMatchObject({
      tenantId: "tenant-ada",
      body: "Hello",
      externalId: "wamid.inbound.1",
    });
    expect(store.conversations[0]?.tenantId).toBe("tenant-ada");
  });

  it("sends the greeting template to an unknown number and returns HTTP 200", async () => {
    const provider = new FakeWhatsAppProvider();
    const { db, store } = createDb({
      tenants: [{ id: "tenant-ada", name: "Ada Salon", whatsappNumber: "2348099990001" }],
    });
    __setWhatsAppInboundDepsForTests({ db, provider, appSecret: SECRET });

    const response = await POST(
      signedPost(
        payload({
          displayPhone: "2348099990001",
          from: "2348090001111",
          id: "wamid.unknown.1",
          text: "I need a haircut",
        })
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, persisted: 1 });
    expect(store.conversations).toHaveLength(1);
    expect(store.conversations[0]?.clientId).toBeNull();
    expect(provider.outbox).toHaveLength(1);
    expect(provider.outbox[0]).toMatchObject({
      to: "+2348090001111",
      httpStatus: 200,
      content: {
        kind: "template",
        name: "greeting",
        language: "en",
        bodyParameters: ["Ada Salon"],
      },
    });
    expect(
      store.messages.some(
        (message) => message.direction === "outbound" && message.kind === "template"
      )
    ).toBe(true);
  });

  it("resumes a known client without sending another greeting", async () => {
    const provider = new FakeWhatsAppProvider();
    const { db, store } = createDb({
      tenants: [{ id: "tenant-ada", name: "Ada Salon", whatsappNumber: "2348099990001" }],
      clients: [
        {
          id: "client-ada",
          tenantId: "tenant-ada",
          name: "Ada Customer",
          phone: "+2348012345678",
        },
      ],
    });
    __setWhatsAppInboundDepsForTests({ db, provider, appSecret: SECRET });

    const first = await POST(
      signedPost(
        payload({
          displayPhone: "2348099990001",
          from: "2348012345678",
          id: "wamid.known.1",
          text: "Hi, it's me",
        })
      )
    );
    const second = await POST(
      signedPost(
        payload({
          displayPhone: "2348099990001",
          from: "08012345678",
          id: "wamid.known.2",
          text: "Book a haircut tomorrow",
        })
      )
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(provider.outbox).toHaveLength(0);
    expect(store.clients).toHaveLength(1);
    expect(store.conversations).toHaveLength(1);
    expect(store.conversations[0]).toMatchObject({
      tenantId: "tenant-ada",
      clientId: "client-ada",
      customerPhone: "+2348012345678",
    });
    const inbound = store.messages.filter((message) => message.direction === "inbound");
    expect(inbound.map((message) => message.body)).toEqual([
      "Hi, it's me",
      "Book a haircut tomorrow",
    ]);
    expect(inbound.every((message) => message.tenantId === "tenant-ada")).toBe(true);
    expect(inbound.every((message) => message.conversationId === store.conversations[0]?.id)).toBe(
      true
    );
  });

  it("rejects a missing signature", async () => {
    const { db } = createDb();
    __setWhatsAppInboundDepsForTests({
      db,
      appSecret: SECRET,
      provider: new FakeWhatsAppProvider(),
    });
    const response = await POST(
      new NextRequest("http://app.test/api/webhooks/whatsapp", {
        method: "POST",
        body: "{}",
      })
    );
    expect(response.status).toBe(401);
  });

  it("echoes the Meta subscription challenge", async () => {
    __setWhatsAppInboundDepsForTests({
      verifyToken: VERIFY_TOKEN,
      appSecret: SECRET,
      provider: new FakeWhatsAppProvider(),
      db: createDb().db,
    });
    const response = await GET(
      new NextRequest(
        `http://app.test/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=12345`
      )
    );
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("12345");
  });
});
