import { Prisma } from "@prisma/client";

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

type AdvisoryLockTransaction = {
  $executeRaw(query: ReturnType<typeof Prisma.sql>): Promise<unknown>;
};

type TransactionClient = {
  $transaction<T>(operation: (transaction: AdvisoryLockTransaction) => Promise<T>): Promise<T>;
};

/**
 * Produces the pair of signed 32-bit values accepted by PostgreSQL's
 * two-integer advisory-lock function. The same resource name always maps to
 * the same key across workers.
 */
export function advisoryLockKey(resource: string): readonly [number, number] {
  const hash = (value: string): number => {
    let result = FNV_OFFSET_BASIS;

    for (const byte of new TextEncoder().encode(value)) {
      result ^= byte;
      result = Math.imul(result, FNV_PRIME);
    }

    return result;
  };

  return [
    hash(`bukay:reminders:primary:${resource}`),
    hash(`bukay:reminders:secondary:${resource}`),
  ];
}

/**
 * Runs work in a transaction after acquiring PostgreSQL's transaction-scoped
 * advisory lock. The lock releases automatically when the callback commits or
 * rolls back, including when the callback throws.
 */
export async function withPostgresAdvisoryLock<T>(
  client: TransactionClient,
  resource: string,
  work: (transaction: AdvisoryLockTransaction) => Promise<T>
): Promise<T> {
  const [firstKey, secondKey] = advisoryLockKey(resource);

  return client.$transaction(async (transaction) => {
    await transaction.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(${firstKey}, ${secondKey})`
    );
    return work(transaction);
  });
}
