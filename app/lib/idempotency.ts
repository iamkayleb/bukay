import { prisma } from "@/app/db/prisma";

// Entries expire after seven days, matching Paystack's retry window. The
// database primary key is the concurrency boundary, so replay protection is
// retained when a request lands on another instance or after a restart.
export const IDEMPOTENCY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type IdempotencyDelegate = {
  create(args: unknown): Promise<unknown>;
  deleteMany(args: unknown): Promise<unknown>;
};

export class IdempotencyStore {
  constructor(private readonly events: IdempotencyDelegate = prisma.idempotencyEvent) {}

  /**
   * Atomically claim an event key. `true` means this delivery may be handled;
   * `false` means another process has already claimed a non-expired delivery.
   */
  async claim(key: string, now = new Date()): Promise<boolean> {
    await this.events.deleteMany({ where: { key, expiresAt: { lte: now } } });

    try {
      await this.events.create({
        data: { key, expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS) },
      });
      return true;
    } catch (error) {
      if ((error as { code?: unknown })?.code === "P2002") {
        return false;
      }
      throw error;
    }
  }
}

export const idempotencyStore = new IdempotencyStore();
