/**
 * Dead-letter retention for webhook (and similar) payloads that may contain
 * sensitive payment data. Rows older than {@link DEAD_LETTER_RETENTION_MS}
 * are deleted on every authenticated Paystack webhook (see paystack-webhook).
 */

export const DEAD_LETTER_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type DeadLetterDb = {
  deadLetter: {
    deleteMany(args: { where: { createdAt: { lte: Date } } }): Promise<{ count: number }>;
  };
};

/**
 * Delete dead-letter rows whose `createdAt` is older than the retention window.
 * Returns the number of rows removed.
 */
export async function purgeExpiredDeadLetters(
  db: DeadLetterDb,
  now: Date = new Date(),
  retentionMs: number = DEAD_LETTER_RETENTION_MS
): Promise<number> {
  const cutoff = new Date(now.getTime() - retentionMs);
  const result = await db.deadLetter.deleteMany({
    where: { createdAt: { lte: cutoff } },
  });
  return result.count;
}
