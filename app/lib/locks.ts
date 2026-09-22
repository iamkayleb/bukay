/**
 * Postgres advisory locks for duplicate-safe cron / worker coordination.
 *
 * Production uses `pg_try_advisory_lock` / `pg_advisory_unlock` via Prisma
 * `$queryRaw`. SQLite (local dev) and unit tests fall back to an in-process
 * mutex so parallel workers still serialize on the same key.
 */

export type AdvisoryLockDb = {
  $queryRaw: <T = unknown>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
};

/** Stable 32-bit signed key for `pg_advisory_lock` from an arbitrary string. */
export function advisoryLockKey(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (Math.imul(31, hash) + input.charCodeAt(i)) | 0;
  }
  return hash === 0 ? 1 : hash;
}

type MemoryLockState = {
  held: boolean;
  waiters: Array<() => void>;
};

const memoryLocks = new Map<number, MemoryLockState>();

function memoryTryLock(key: number): boolean {
  const state = memoryLocks.get(key);
  if (state?.held) {
    return false;
  }
  memoryLocks.set(key, { held: true, waiters: state?.waiters ?? [] });
  return true;
}

function memoryUnlock(key: number): void {
  const state = memoryLocks.get(key);
  if (!state) return;
  const next = state.waiters.shift();
  if (next) {
    state.held = true;
    next();
    return;
  }
  state.held = false;
  memoryLocks.delete(key);
}

function isPostgresAdvisoryUnsupported(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /pg_try_advisory_lock|pg_advisory_unlock|no such function|syntax error/i.test(message) ||
    /SQLite|sqlite/i.test(message)
  );
}

/**
 * Non-blocking try-lock. Returns true when this caller holds the lock.
 */
export async function tryAdvisoryLock(
  db: AdvisoryLockDb | null | undefined,
  key: number
): Promise<boolean> {
  if (!db?.$queryRaw) {
    return memoryTryLock(key);
  }

  try {
    const rows = await db.$queryRaw<Array<{ locked: boolean | number | null }>>`
      SELECT pg_try_advisory_lock(${key}) AS locked
    `;
    const value = rows[0]?.locked;
    return value === true || value === 1;
  } catch (error) {
    if (isPostgresAdvisoryUnsupported(error)) {
      return memoryTryLock(key);
    }
    throw error;
  }
}

/**
 * Release a previously acquired advisory lock.
 */
export async function releaseAdvisoryLock(
  db: AdvisoryLockDb | null | undefined,
  key: number
): Promise<void> {
  if (!db?.$queryRaw) {
    memoryUnlock(key);
    return;
  }

  try {
    await db.$queryRaw`SELECT pg_advisory_unlock(${key})`;
  } catch (error) {
    if (isPostgresAdvisoryUnsupported(error)) {
      memoryUnlock(key);
      return;
    }
    throw error;
  }
}

/**
 * Run `fn` while holding the advisory lock for `key`.
 * Returns `{ acquired: false }` when the lock is already held elsewhere.
 */
export async function withAdvisoryLock<T>(
  db: AdvisoryLockDb | null | undefined,
  key: number,
  fn: () => Promise<T>
): Promise<{ acquired: false } | { acquired: true; result: T }> {
  const acquired = await tryAdvisoryLock(db, key);
  if (!acquired) {
    return { acquired: false };
  }
  try {
    const result = await fn();
    return { acquired: true, result };
  } finally {
    await releaseAdvisoryLock(db, key);
  }
}

/** Test helper: drop all in-memory lock state. */
export function __resetMemoryAdvisoryLocksForTests(): void {
  memoryLocks.clear();
}
