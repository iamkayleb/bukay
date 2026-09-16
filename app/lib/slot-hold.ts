import { prisma } from "@/app/db/prisma";

export const SLOT_HOLD_DURATION_MS = 10 * 60 * 1_000;

type SlotHoldRecord = {
  sessionId: string;
};

type SlotHoldDelegate = {
  create(args: unknown): Promise<unknown>;
  deleteMany(args: unknown): Promise<unknown>;
  findUnique(args: unknown): Promise<SlotHoldRecord | null>;
  update(args: unknown): Promise<unknown>;
};

/**
 * Durable protection for the interval between checkout and payment.
 *
 * `slotKey` is unique in storage, making the create operation the conflict
 * arbiter even when requests are handled by separate server instances.
 */
export class SlotHoldStore {
  constructor(private readonly holds: SlotHoldDelegate = prisma.slotHold) {}

  async acquire(
    slotKey: string,
    tenantId: string,
    sessionId: string,
    now = new Date()
  ): Promise<boolean> {
    await this.holds.deleteMany({
      where: { slotKey, expiresAt: { lte: now } },
    });

    try {
      await this.holds.create({
        data: {
          tenantId,
          slotKey,
          sessionId,
          expiresAt: new Date(now.getTime() + SLOT_HOLD_DURATION_MS),
        },
      });
      return true;
    } catch (error) {
      if ((error as { code?: unknown })?.code !== "P2002") {
        throw error;
      }
    }

    const existing = await this.holds.findUnique({ where: { slotKey } });
    if (existing?.sessionId !== sessionId) {
      return false;
    }

    await this.holds.update({
      where: { slotKey },
      data: { expiresAt: new Date(now.getTime() + SLOT_HOLD_DURATION_MS) },
    });
    return true;
  }

  /**
   * Release the hold owned by a failed checkout session.
   *
   * The session predicate is important: cleanup from an older failed request
   * must never remove a hold refreshed by a different customer.
   */
  async releaseAfterFailure(slotKey: string, sessionId: string): Promise<boolean> {
    const result = (await this.holds.deleteMany({ where: { slotKey, sessionId } })) as {
      count?: number;
    };
    return (result.count ?? 0) > 0;
  }

  async release(slotKey: string, sessionId: string): Promise<void> {
    await this.releaseAfterFailure(slotKey, sessionId);
  }

  async clear(): Promise<void> {
    await this.holds.deleteMany({ where: {} });
  }
}

export const slotHolds = new SlotHoldStore();
