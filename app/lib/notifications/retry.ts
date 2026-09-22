/**
 * Exponential backoff helpers for notification sends.
 *
 * Delay grows as `baseDelayMs * 2^(attempt - 1)`, capped at `maxDelayMs`.
 * Optional jitter spreads retries so a thundering herd cannot stampede a
 * recovering provider.
 */

export type BackoffOptions = {
  /** Total attempts including the first try. Default 3. */
  maxAttempts?: number;
  /** Delay before the second attempt. Default 100ms. */
  baseDelayMs?: number;
  /** Upper bound on sleep between attempts. Default 5_000ms. */
  maxDelayMs?: number;
  /** When true, multiply delay by a random factor in [0.5, 1.5]. */
  jitter?: boolean;
  /** Injectable sleep for tests. Defaults to `setTimeout`. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable RNG for deterministic jitter in tests. */
  random?: () => number;
};

export type BackoffExhaustedError = Error & {
  readonly name: "BackoffExhaustedError";
  readonly attempts: number;
  readonly lastError: unknown;
};

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 100;
const DEFAULT_MAX_DELAY_MS = 5_000;

export function computeBackoffDelay(
  attempt: number,
  options: Pick<BackoffOptions, "baseDelayMs" | "maxDelayMs" | "jitter" | "random"> = {}
): number {
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const raw = baseDelayMs * 2 ** Math.max(0, attempt - 1);
  let delay = Math.min(raw, maxDelayMs);

  if (options.jitter) {
    const random = options.random ?? Math.random;
    const factor = 0.5 + random();
    delay = Math.min(Math.round(delay * factor), maxDelayMs);
  }

  return delay;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function asBackoffExhausted(attempts: number, lastError: unknown): BackoffExhaustedError {
  const message =
    lastError instanceof Error
      ? `Backoff exhausted after ${attempts} attempts: ${lastError.message}`
      : `Backoff exhausted after ${attempts} attempts`;
  const error = new Error(message) as BackoffExhaustedError;
  error.name = "BackoffExhaustedError";
  Object.defineProperty(error, "attempts", { value: attempts });
  Object.defineProperty(error, "lastError", { value: lastError });
  return error;
}

/**
 * Invoke `fn` until it succeeds or `maxAttempts` is reached.
 * Retries only after a thrown error; successful results return immediately.
 */
export async function withBackoff<T>(
  fn: (attempt: number) => Promise<T>,
  options: BackoffOptions = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const sleep = options.sleep ?? defaultSleep;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      if (attempt >= maxAttempts) break;
      await sleep(computeBackoffDelay(attempt, options));
    }
  }

  throw asBackoffExhausted(maxAttempts, lastError);
}
