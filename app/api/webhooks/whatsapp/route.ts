import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/app/db/prisma";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";
import { metaWhatsAppFromEnv } from "@/app/lib/whatsapp/meta";
import { normalizeWhatsAppNumber, resolveTenantByNumber } from "@/app/lib/whatsapp/routing";
import { verifyMetaSignature } from "@/app/lib/whatsapp/signature";
import { sendGreeting } from "@/app/lib/whatsapp/templates";

export const dynamic = "force-dynamic";

type ConversationRecord = {
  id: string;
  clientId: string | null;
  greetedAt: Date | null;
};

const clientDelegate = prisma.client as unknown as {
  findFirst(args: unknown): Promise<{ id: string } | null>;
};

const conversationDelegate = prisma.conversation as unknown as {
  findFirst(args: unknown): Promise<ConversationRecord | null>;
  create(args: unknown): Promise<ConversationRecord>;
  update(args: unknown): Promise<ConversationRecord>;
};

const messageDelegate = prisma.message as unknown as {
  findFirst(args: unknown): Promise<{ id: string } | null>;
  create(args: unknown): Promise<{ id: string }>;
};

const deadLetterDelegate = (
  prisma as unknown as { deadLetterEvent?: { create(args: unknown): Promise<unknown> } }
).deadLetterEvent;

const inboundMessageSchema = z
  .object({
    id: z.string().min(1),
    from: z.string().min(1),
    type: z.string().default("text"),
    text: z.object({ body: z.string() }).partial().optional(),
  })
  .passthrough();

const webhookSchema = z
  .object({
    entry: z.array(
      z
        .object({
          changes: z.array(
            z
              .object({
                value: z
                  .object({
                    metadata: z
                      .object({ display_phone_number: z.string().optional() })
                      .passthrough()
                      .optional(),
                    messages: z.array(z.unknown()).optional(),
                  })
                  .passthrough(),
              })
              .passthrough()
          ),
        })
        .passthrough()
    ),
  })
  .passthrough();

async function recordDeadLetter(rawBody: string, reason: string): Promise<void> {
  if (!deadLetterDelegate) return;
  await deadLetterDelegate.create({
    data: { provider: "whatsapp", eventType: "message", payload: rawBody, reason },
  });
}

// Meta's one-time subscription handshake.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (
    params.get("hub.mode") === "subscribe" &&
    verifyToken &&
    params.get("hub.verify_token") === verifyToken
  ) {
    return new NextResponse(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
}

async function handleInbound(
  tenant: { tenantId: string; name: string },
  message: z.infer<typeof inboundMessageSchema>
): Promise<void> {
  const { tenantId } = tenant;
  const phone = normalizeWhatsAppNumber(message.from);
  if (!phone) return;

  await runWithTenantContext({ tenantId }, async () => {
    const client = await clientDelegate.findFirst({ where: { tenantId, phone } });

    let conversation = await conversationDelegate.findFirst({ where: { tenantId, phone } });
    if (!conversation) {
      conversation = await conversationDelegate.create({
        data: { tenantId, phone, clientId: client?.id ?? null },
      });
    } else if (client && conversation.clientId !== client.id) {
      conversation = await conversationDelegate.update({
        where: { id: conversation.id, tenantId },
        data: { clientId: client.id },
      });
    }

    // Provider redeliveries carry the same message id; persist each only once.
    const duplicate = await messageDelegate.findFirst({
      where: { tenantId, providerMessageId: message.id },
    });
    if (!duplicate) {
      await messageDelegate.create({
        data: {
          tenantId,
          conversationId: conversation.id,
          direction: "inbound",
          type: message.type,
          body: message.text?.body ?? null,
          providerMessageId: message.id,
        },
      });
      await conversationDelegate.update({
        where: { id: conversation.id, tenantId },
        data: { lastMessageAt: new Date() },
      });
    }

    // A known client resumes as-is; only unidentified senders get the greeting,
    // and only once per conversation.
    if (conversation.clientId || client || conversation.greetedAt) return;

    const sent = await sendGreeting(metaWhatsAppFromEnv(), {
      to: phone,
      businessName: tenant.name,
    });
    await messageDelegate.create({
      data: {
        tenantId,
        conversationId: conversation.id,
        direction: "outbound",
        type: "template",
        body: "greeting",
        providerMessageId: sent.id,
      },
    });
    await conversationDelegate.update({
      where: { id: conversation.id, tenantId },
      data: { greetedAt: new Date() },
    });
  });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  if (
    !verifyMetaSignature(
      rawBody,
      req.headers.get("x-hub-signature-256"),
      process.env.WHATSAPP_APP_SECRET
    )
  ) {
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = webhookSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  let processed = 0;
  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      const { metadata, messages } = change.value;
      if (!messages?.length) continue; // delivery/read statuses carry no messages

      const tenant = await resolveTenantByNumber(metadata?.display_phone_number);
      if (!tenant) {
        await recordDeadLetter(rawBody, "unknown_business_number");
        continue;
      }

      for (const raw of messages) {
        const message = inboundMessageSchema.safeParse(raw);
        if (!message.success) continue;
        try {
          await handleInbound(tenant, message.data);
          processed += 1;
        } catch (err) {
          // Greeting/provider failures must not turn into webhook retries that
          // re-deliver an already persisted message.
          console.error("whatsapp inbound handling failed", err);
        }
      }
    }
  }

  return NextResponse.json({ ok: true, processed });
}
