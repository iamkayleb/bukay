import { prisma } from "@/app/db/prisma";

// Durable idempotency store for at-least-once event delivery (e.g. Paystack
// webhook retries), backed by the IdempotencyKey table so a replayed event is
// still recognized after a process restart. Entries expire after seven days,
// matching Paystack's own retry window.
export const IDEMPOTENCY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const idempotencyKeyDelegate = prisma.idempotencyKey as unknown as {
  findUnique(args: unknown): Promise<{ key: string; expiresAt: Date } | null>;
  create(args: unknown): Promise<unknown>;
  update(args: unknown): Promise<unknown>;
  deleteMany(args: unknown): Promise<unknown>;
};

function isUniqueConstraintError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

// Atomically claims a key for processing and returns true only for the
// caller that actually gets to process the event. This relies on the
// table's primary-key uniqueness constraint rather than a separate
// read-then-write, so two concurrent deliveries of the same webhook retry
// can't both observe "unseen" and double-process the event.
export async function claimIdempotencyKey(key: string, now: number = Date.now()): Promise<boolean> {
  const expiresAt = new Date(now + IDEMPOTENCY_TTL_MS);

  try {
    await idempotencyKeyDelegate.create({ data: { key, expiresAt } });
    return true;
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }
  }

  const existing = await idempotencyKeyDelegate.findUnique({ where: { key } });
  if (existing && existing.expiresAt.getTime() > now) {
    return false;
  }

  // The existing entry is missing or past its TTL; reclaim it for this
  // delivery instead of permanently refusing a key that already expired.
  await idempotencyKeyDelegate.update({ where: { key }, data: { expiresAt } });
  return true;
}

export async function __resetIdempotencyStoreForTests(): Promise<void> {
  await idempotencyKeyDelegate.deleteMany({});
}
