import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  resolveTenant: vi.fn(),
  sendTemplate: vi.fn(),
  messageFindUnique: vi.fn(),
  clientFindUnique: vi.fn(),
  conversationUpsert: vi.fn(),
  messageCreate: vi.fn(),
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    message: { findUnique: state.messageFindUnique, create: state.messageCreate },
    client: { findUnique: state.clientFindUnique },
    conversation: { upsert: state.conversationUpsert },
  },
}));
vi.mock("@/app/lib/whatsapp/routing", () => ({
  resolveTenantByWhatsAppNumber: state.resolveTenant,
  normalizeWhatsAppNumber: (phone: string) => `+${phone.replace(/\D/g, "")}`,
}));
vi.mock("@/app/lib/whatsapp/meta", () => ({
  metaWhatsAppFromEnv: () => ({ name: "fake", sendTemplate: state.sendTemplate }),
}));

import { GET, POST, hasValidWhatsAppSignature } from "@/app/api/webhooks/whatsapp/route";

const payload = {
  object: "whatsapp_business_account",
  entry: [
    {
      changes: [
        {
          field: "messages",
          value: {
            metadata: { display_phone_number: "+234 800 000 0000" },
            messages: [
              { id: "wamid.1", from: "2348012345678", type: "text", text: { body: "Hello" } },
            ],
          },
        },
      ],
    },
  ],
};

function webhook(body: unknown) {
  return new NextRequest("http://bukay.test/api/webhooks/whatsapp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  delete process.env.META_WHATSAPP_APP_SECRET;
  state.resolveTenant.mockReset().mockResolvedValue({ id: "tenant-1", name: "Bukay Salon" });
  state.sendTemplate.mockReset().mockResolvedValue({ id: "outbound-1" });
  state.messageFindUnique.mockReset().mockResolvedValue(null);
  state.clientFindUnique.mockReset().mockResolvedValue(null);
  state.conversationUpsert.mockReset().mockResolvedValue({ id: "conversation-1" });
  state.messageCreate.mockReset().mockResolvedValue({ id: "message-1" });
});

describe("POST /api/webhooks/whatsapp", () => {
  it("persists inbound messages against the business number's tenant", async () => {
    const response = await POST(webhook(payload));

    expect(response.status).toBe(200);
    expect(state.conversationUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_phone: { tenantId: "tenant-1", phone: "+2348012345678" } },
      })
    );
    expect(state.messageCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant-1",
        conversationId: "conversation-1",
        providerMessageId: "wamid.1",
        direction: "inbound",
        body: "Hello",
      }),
    });
  });

  it("greets an unknown sender and acknowledges the webhook", async () => {
    const response = await POST(webhook(payload));

    expect(response.status).toBe(200);
    expect(state.sendTemplate).toHaveBeenCalledWith({
      to: "+2348012345678",
      template: "welcome",
      language: "en_US",
      parameters: ["Bukay Salon"],
    });
  });

  it("associates a known client and does not ask them to identify again", async () => {
    state.clientFindUnique.mockResolvedValue({ id: "client-1" });

    const response = await POST(webhook(payload));

    expect(response.status).toBe(200);
    expect(state.conversationUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ clientId: "client-1" }) })
    );
    expect(state.sendTemplate).not.toHaveBeenCalled();
  });

  it("does not repeat processing for a retried provider message", async () => {
    state.messageFindUnique.mockResolvedValue({ id: "message-1" });

    await expect(POST(webhook(payload))).resolves.toMatchObject({ status: 200 });
    expect(state.conversationUpsert).not.toHaveBeenCalled();
    expect(state.sendTemplate).not.toHaveBeenCalled();
  });
});

describe("GET /api/webhooks/whatsapp", () => {
  it("returns Meta's verified challenge", async () => {
    process.env.META_WHATSAPP_VERIFY_TOKEN = "verify-me";
    const response = await GET(
      new NextRequest(
        "http://bukay.test/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=123"
      )
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("123");
  });
});

describe("hasValidWhatsAppSignature", () => {
  it("rejects a signature with the wrong length", () => {
    expect(hasValidWhatsAppSignature("body", "sha256=short", "secret")).toBe(false);
  });
});
