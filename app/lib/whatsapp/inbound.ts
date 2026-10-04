import { createHmac, timingSafeEqual } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { getSenderRateLimiter, type SenderRateLimiter } from "@/app/lib/rate-limit";

import { FakeWhatsAppProvider } from "./fake";
import { metaWhatsAppFromEnv } from "./meta";
import type { WhatsAppProvider } from "./provider";
import { canonicalCustomerPhone, resolveTenantByNumber, type TenantByNumber } from "./routing";
import { sendGreetingTemplate } from "./templates";

export type ConversationRow = {
  id: string;
  tenantId: string;
  customerPhone: string;
  clientId: string | null;
  status: string;
};

export type MessageRow = {
  id: string;
  tenantId: string;
  conversationId: string;
  direction: string;
  kind: string;
  body: string;
  externalId: string | null;
};

export type ClientRow = {
  id: string;
  tenantId: string;
  phone: string;
  name: string;
};

export type WhatsAppInboundDb = {
  tenant: {
    findFirst(args: { where: { whatsappNumber: string } }): Promise<TenantByNumber | null>;
  };
  client: {
    findFirst(args: { where: { tenantId: string; phone: string } }): Promise<ClientRow | null>;
  };
  conversation: {
    findFirst(args: {
      where: { tenantId: string; customerPhone: string };
    }): Promise<ConversationRow | null>;
    create(args: {
      data: {
        tenantId: string;
        customerPhone: string;
        clientId: string | null;
        status: string;
      };
    }): Promise<ConversationRow>;
    update(args: {
      where: { id: string; tenantId: string };
      data: { clientId: string };
    }): Promise<ConversationRow>;
  };
  message: {
    findFirst(args: { where: { externalId: string } }): Promise<MessageRow | null>;
    create(args: { data: Omit<MessageRow, "id"> & { id?: string } }): Promise<MessageRow>;
  };
};

export type WhatsAppInboundDeps = {
  db?: WhatsAppInboundDb;
  provider?: WhatsAppProvider;
  appSecret?: string;
  verifyToken?: string;
  rateLimiter?: SenderRateLimiter;
};

type InboundText = {
  from?: string;
  id?: string;
  type?: string;
  text?: { body?: string };
};

type WebhookChange = {
  value?: {
    metadata?: {
      display_phone_number?: string;
      phone_number_id?: string;
    };
    messages?: InboundText[];
  };
};

type WebhookBody = {
  entry?: Array<{ changes?: WebhookChange[] }>;
};

const globalForDb = globalThis as unknown as { whatsAppInboundDb?: PrismaClient };

let testDeps: WhatsAppInboundDeps | null = null;

/** Test-only override for the Prisma client, provider, and webhook secrets. */
export function __setWhatsAppInboundDepsForTests(deps: WhatsAppInboundDeps | null): void {
  testDeps = deps;
}

function defaultDb(): WhatsAppInboundDb {
  if (!globalForDb.whatsAppInboundDb) {
    globalForDb.whatsAppInboundDb = new PrismaClient();
  }
  return globalForDb.whatsAppInboundDb as unknown as WhatsAppInboundDb;
}

function defaultProvider(): WhatsAppProvider {
  const token = process.env.WHATSAPP_ACCESS_TOKEN ?? process.env.META_WHATSAPP_ACCESS_TOKEN;
  if (token) return metaWhatsAppFromEnv();
  return new FakeWhatsAppProvider();
}

function resolveDeps(
  deps?: WhatsAppInboundDeps
): Required<Pick<WhatsAppInboundDeps, "db" | "provider">> & WhatsAppInboundDeps {
  const merged: WhatsAppInboundDeps = { ...testDeps, ...deps };
  return {
    ...merged,
    db: merged.db ?? defaultDb(),
    provider: merged.provider ?? defaultProvider(),
  };
}

export function signWhatsAppBody(body: string, secret: string): string {
  const digest = createHmac("sha256", secret).update(body, "utf8").digest("hex");
  return `sha256=${digest}`;
}

export function verifyWhatsAppSignature(
  body: string,
  signature: string | null | undefined,
  secret: string
): boolean {
  if (!signature || !secret) return false;
  const expected = signWhatsAppBody(body, secret);
  const provided = Buffer.from(signature.trim().toLowerCase(), "utf8");
  const actual = Buffer.from(expected.toLowerCase(), "utf8");
  if (provided.length !== actual.length) return false;
  return timingSafeEqual(provided, actual);
}

function appSecret(deps: WhatsAppInboundDeps): string {
  return deps.appSecret ?? process.env.WHATSAPP_APP_SECRET ?? process.env.META_APP_SECRET ?? "";
}

function verifyToken(deps: WhatsAppInboundDeps): string {
  return deps.verifyToken ?? process.env.WHATSAPP_VERIFY_TOKEN ?? "";
}

/** Meta subscription handshake: echo `hub.challenge` when the verify token matches. */
export function verifyWhatsAppSubscription(
  request: NextRequest,
  deps?: WhatsAppInboundDeps
): NextResponse {
  const resolved = resolveDeps(deps);
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = verifyToken(resolved);
  if (mode === "subscribe" && expected && token === expected && challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

function messageBody(message: InboundText): { kind: string; body: string } {
  if (message.type === "text" || message.text?.body) {
    return { kind: "text", body: message.text?.body ?? "" };
  }
  return { kind: message.type || "unknown", body: `[${message.type || "unknown"}]` };
}

async function recordInbound(
  db: WhatsAppInboundDb,
  provider: WhatsAppProvider,
  tenant: TenantByNumber,
  message: InboundText
): Promise<boolean> {
  const externalId = message.id?.trim() ?? "";
  const from = message.from?.trim() ?? "";
  if (!externalId || !from) return false;

  const duplicate = await db.message.findFirst({ where: { externalId } });
  if (duplicate) return false;

  const customerPhone = canonicalCustomerPhone(from);
  if (!customerPhone) return false;

  const client = await db.client.findFirst({
    where: { tenantId: tenant.id, phone: customerPhone },
  });

  let conversation = await db.conversation.findFirst({
    where: { tenantId: tenant.id, customerPhone },
  });
  const resumed = Boolean(conversation);
  const content = messageBody(message);
  // Unknown senders get the greeting once, when the thread is created.
  // A known client, or any resumed thread, is not asked to identify again.
  // Send before writing rows so a provider failure can be retried by Meta.
  const greeting =
    !client && !resumed
      ? await sendGreetingTemplate(provider, {
          to: customerPhone,
          businessName: tenant.name,
        })
      : null;

  if (!conversation) {
    conversation = await db.conversation.create({
      data: {
        tenantId: tenant.id,
        customerPhone,
        clientId: client?.id ?? null,
        status: "open",
      },
    });
  } else if (client && conversation.clientId !== client.id) {
    conversation = await db.conversation.update({
      where: { id: conversation.id, tenantId: tenant.id },
      data: { clientId: client.id },
    });
  }

  await db.message.create({
    data: {
      tenantId: tenant.id,
      conversationId: conversation.id,
      direction: "inbound",
      kind: content.kind,
      body: content.body,
      externalId,
    },
  });

  if (greeting) {
    await db.message.create({
      data: {
        tenantId: tenant.id,
        conversationId: conversation.id,
        direction: "outbound",
        kind: "template",
        body: "greeting",
        externalId: greeting.id,
      },
    });
  }

  return true;
}

/**
 * Receive a Meta WhatsApp Cloud API webhook, route it by business number,
 * persist the inbound message, and greet unknown senders.
 */
export async function handleWhatsAppInbound(
  request: NextRequest,
  deps?: WhatsAppInboundDeps
): Promise<NextResponse> {
  const resolved = resolveDeps(deps);
  const raw = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifyWhatsAppSignature(raw, signature, appSecret(resolved))) {
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
  }

  let body: WebhookBody;
  try {
    body = JSON.parse(raw) as WebhookBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  let persisted = 0;
  try {
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const metadata = change.value?.metadata;
        const businessNumber = metadata?.display_phone_number || metadata?.phone_number_id || "";
        if (!businessNumber) continue;

        const tenant = await resolveTenantByNumber(
          {
            findByWhatsAppNumber: (number) =>
              resolved.db.tenant.findFirst({ where: { whatsappNumber: number } }),
          },
          businessNumber
        );
        if (!tenant) continue;

        const limiter = resolved.rateLimiter ?? getSenderRateLimiter();
        for (const message of change.value?.messages ?? []) {
          const from = message.from?.trim() ?? "";
          if (from) {
            const decision = limiter.consume(from);
            if (!decision.allowed) {
              return NextResponse.json(
                {
                  ok: false,
                  error: decision.error,
                  retryAfterSeconds: decision.retryAfterSeconds,
                },
                {
                  status: decision.status,
                  headers: { "Retry-After": String(decision.retryAfterSeconds) },
                }
              );
            }
          }

          const saved = await recordInbound(resolved.db, resolved.provider, tenant, message);
          if (saved) persisted += 1;
        }
      }
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: "failed to process inbound message" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, persisted }, { status: 200 });
}
