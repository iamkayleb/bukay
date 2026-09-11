export const SLOT_HOLD_DURATION_MS = 10 * 60 * 1_000;

type SlotHold = {
  expiresAt: number;
  sessionId: string;
};

/**
 * In-memory protection for the short period between checkout and payment.
 *
 * The store is deliberately small and synchronous: acquiring a slot either
 * succeeds for one session or reports that another live session owns it.
 */
export class SlotHoldStore {
  private readonly holds = new Map<string, SlotHold>();

  acquire(slot: string, sessionId: string, now = Date.now()): boolean {
    const existing = this.holds.get(slot);
    if (existing && existing.expiresAt > now && existing.sessionId !== sessionId) {
      return false;
    }

    this.holds.set(slot, { sessionId, expiresAt: now + SLOT_HOLD_DURATION_MS });
    return true;
  }

  release(slot: string, sessionId: string): void {
    if (this.holds.get(slot)?.sessionId === sessionId) {
      this.holds.delete(slot);
    }
  }

  clear(): void {
    this.holds.clear();
  }
}

export const slotHolds = new SlotHoldStore();
