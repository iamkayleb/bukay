export type RetryOptions = {
  /** Total attempts including the first. Defaults to 3. */
  maxAttempts?: number;
  /** Delay before the second attempt; doubles each retry. Defaults to 500ms. */
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Return false to stop retrying a permanent failure. Defaults to `isRetryableError`. */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Injected for tests; returns [0, 1). Used for jitter. */
  random?: () => number;
};

export class RetryExhaustedError extends Error {
  readonly attempts: number;
  readonly cause: unknown;

  constructor(attempts: number, cause: unknown) {
    super(
      `Gave up after ${attempts} attempt(s): ${cause instanceof Error ? cause.message : cause}`
    );
    this.name = "RetryExhaustedError";
    this.attempts = attempts;
    this.cause = cause;
  }
}

/** Network errors (no status), 429 and 5xx are transient; other 4xx will not succeed on retry. */
export function isRetryableError(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status !== "number") return true;
  return status === 429 || status >= 500;
}

/** Exponential backoff with +/-20% jitter, capped at `maxDelayMs`. Attempt is 1-based. */
export function backoffDelayMs(
  attempt: number,
  { baseDelayMs = 500, maxDelayMs = 30_000, random = Math.random }: RetryOptions = {}
): number {
  const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
  return Math.round(exp * (0.8 + random() * 0.4));
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Runs `fn` until it succeeds, a permanent error occurs, or attempts run out. */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const shouldRetry = options.shouldRetry ?? isRetryableError;
  const sleep = options.sleep ?? defaultSleep;

  for (let attempt = 1; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      if (attempt >= maxAttempts || !shouldRetry(error, attempt)) {
        throw new RetryExhaustedError(attempt, error);
      }
      await sleep(backoffDelayMs(attempt, options));
    }
  }
}
