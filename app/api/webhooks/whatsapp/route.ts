import { createHmac, timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/app/db/prisma";
import { metaWhatsAppFromEnv } from "@/app/lib/whatsapp/meta";
import { normalizeWhatsAppNumber, resolveTenantByWhatsAppNumber } from "@/app/lib/whatsapp/routing";
import { getWhatsAppTemplate, templateParameters } from "@/app/lib/whatsapp/templates";

export const runtime = "nodejs";

const inboundWebhookSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(
    z.object({
      changes: z.array(
        z.object({
          field: z.string(),
          value: z.unknown(),
        })
      ),
    })
  ),
});

const messagesChangeSchema = z.object({
  field: z.literal("messages"),
  value: z.object({
    metadata: z.object({ display_phone_number: z.string().min(1) }),
    messages: z
      .array(
        z.object({
          id: z.string().min(1),
          from: z.string().min(1),
          type: z.string().min(1),
          text: z.object({ body: z.string().min(1) }).optional(),
        })
      )
      .optional(),
  }),
});

type Tenant = { id: string; name: string };
type WebhookMessage = { id: string; from: string; type: string; text?: { body: string } };
type InboundMessage = WebhookMessage & { type: "text"; text: { body: string } };

export function hasValidWhatsAppSignature(
  body: string,
  signature: string | null,
  appSecret: string
): boolean {
  if (!signature || !appSecret) return false;
  const expected = `sha256=${createHmac("sha256", appSecret).update(body).digest("hex")}`;
  const received = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return received.length === expectedBuffer.length && timingSafeEqual(received, expectedBuffer);
}

/** Meta's initial webhook ownership challenge. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const challenge = params.get("hub.challenge");
  if (
    params.get("hub.mode") !== "subscribe" ||
    !challenge ||
    params.get("hub.verify_token") !== process.env.META_WHATSAPP_VERIFY_TOKEN
  ) {
    return NextResponse.json({ error: "INVALID_CHALLENGE" }, { status: 403 });
  }

  return new NextResponse(challenge, { status: 200, headers: { "content-type": "text/plain" } });
}

/** Records an inbound text message and greets senders who are not known clients. */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const appSecret = process.env.META_WHATSAPP_APP_SECRET;
  if (
    appSecret &&
    !hasValidWhatsAppSignature(rawBody, request.headers.get("x-hub-signature-256"), appSecret)
  ) {
    return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 401 });
  }

  const parsed = inboundWebhookSchema.safeParse(parseJson(rawBody));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_WEBHOOK" }, { status: 400 });

  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      if (change.field !== "messages") continue;

      const messageChange = messagesChangeSchema.safeParse(change);
      // A malformed messages update cannot be processed, but must not prevent
      // Meta from receiving a successful acknowledgement for the whole batch.
      if (!messageChange.success) continue;

      const tenant = await resolveTenantByWhatsAppNumber(
        messageChange.data.value.metadata.display_phone_number
      );
      if (!tenant) continue;

      for (const message of messageChange.data.value.messages ?? []) {
        if (!isInboundTextMessage(message)) continue;
        await recordInboundMessage(tenant, message);
      }
    }
  }

  return NextResponse.json({ received: true });
}

async function recordInboundMessage(tenant: Tenant, message: InboundMessage) {
  const phone = normalizeWhatsAppNumber(message.from);
  if (!phone) return;

  // Meta retries webhooks, so do not create duplicate messages or greetings.
  const existing = await prisma.message.findUnique({ where: { providerMessageId: message.id } });
  if (existing) return;

  const client = await prisma.client.findUnique({
    where: { tenantId_phone: { tenantId: tenant.id, phone } },
  });
  const conversation = await prisma.conversation.upsert({
    where: { tenantId_phone: { tenantId: tenant.id, phone } },
    create: { tenantId: tenant.id, phone, ...(client ? { clientId: client.id } : {}) },
    update: client ? { clientId: client.id } : {},
  });
  try {
    await prisma.message.create({
      data: {
        tenantId: tenant.id,
        conversationId: conversation.id,
        direction: "inbound",
        body: message.text.body,
        providerMessageId: message.id,
      },
    });
  } catch (error) {
    // The initial lookup makes ordinary Meta retries cheap. The unique index is
    // still authoritative when two retry deliveries race each other.
    if (isUniqueConstraintError(error)) return;
    throw error;
  }

  if (!client) {
    const existingGreeting = await prisma.message.findFirst({
      where: {
        conversationId: conversation.id,
        direction: "outbound",
        body: "Greeting template: welcome",
      },
      select: { id: true },
    });
    if (existingGreeting) return;

    const greeting = await sendGreeting(phone, tenant.name);
    await prisma.message.create({
      data: {
        tenantId: tenant.id,
        conversationId: conversation.id,
        direction: "outbound",
        body: `Greeting template: ${greeting.template}`,
        providerMessageId: greeting.id,
      },
    });
  }
}

async function sendGreeting(to: string, businessName: string) {
  const template = getWhatsAppTemplate("welcome");
  if (!template) throw new Error("WhatsApp welcome template is not configured");
  const result = await metaWhatsAppFromEnv().sendTemplate({
    to,
    template: template.name,
    language: template.language,
    parameters: templateParameters(template, { businessName }),
  });
  return { id: result.id, template: template.name };
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002"
  );
}

/** Only text is supported by the conversational flow; other Meta message types are acknowledged. */
function isInboundTextMessage(message: WebhookMessage): message is InboundMessage {
  return message.type === "text" && message.text !== undefined;
}
