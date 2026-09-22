import { prisma } from "@/app/db/prisma";

// Durable idempotency store for at-least-once event delivery (e.g. Paystack
// webhook retries), backed by the IdempotencyKey table so a replayed event is
// still recognized after a process restart. Entries expire after seven days,
// matching Paystack's own retry window.
export const IDEMPOTENCY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const idempotencyKeyDelegate = prisma.idempotencyKey as unknown as {
  findUnique(args: unknown): Promise<{ key: string; expiresAt: Date } | null>;
  upsert(args: unknown): Promise<unknown>;
  deleteMany(args: unknown): Promise<unknown>;
};

export async function hasProcessed(key: string, now: number = Date.now()): Promise<boolean> {
  const entry = await idempotencyKeyDelegate.findUnique({ where: { key } });
  return !!entry && entry.expiresAt.getTime() > now;
}

export async function markProcessed(key: string, now: number = Date.now()): Promise<void> {
  const expiresAt = new Date(now + IDEMPOTENCY_TTL_MS);
  await idempotencyKeyDelegate.upsert({
    where: { key },
    create: { key, expiresAt },
    update: { expiresAt },
  });
}

export async function __resetIdempotencyStoreForTests(): Promise<void> {
  await idempotencyKeyDelegate.deleteMany({});
}
