// Postgres advisory locks. Transaction-scoped (`pg_try_advisory_xact_lock`) so
// the lock is released on commit/rollback even if the worker dies or the
// connection returns to a pool; session-level locks would leak across pooled
// connections. The lock only holds while `fn` runs inside the transaction.
//
// Requires a Postgres datasource: the SQLite datasource currently in
// prisma/schema.prisma has no advisory locks.

export interface AdvisoryLockTx {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

export interface AdvisoryLockClient {
  $transaction<R>(fn: (tx: AdvisoryLockTx) => Promise<R>): Promise<R>;
}

export type LockResult<R> = { acquired: true; value: R } | { acquired: false };

/**
 * Runs `fn` while holding the advisory lock named `key`. Returns
 * `{ acquired: false }` without running `fn` when another session holds it.
 */
export async function withAdvisoryLock<R>(
  client: AdvisoryLockClient,
  key: string,
  fn: (tx: AdvisoryLockTx) => Promise<R>
): Promise<LockResult<R>> {
  return client.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ locked: boolean }[]>`
      SELECT pg_try_advisory_xact_lock(hashtextextended(${key}, 0)) AS locked`;
    if (!rows[0]?.locked) return { acquired: false } as const;
    return { acquired: true, value: await fn(tx) } as const;
  });
}
