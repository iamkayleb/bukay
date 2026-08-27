import { EmailProvider } from "./provider";
import { NoopEmailProvider } from "./noop";

let provider: EmailProvider | null = null;

/**
 * Resolves the configured email provider. Only the no-op driver exists
 * today, so every value of EMAIL_PROVIDER currently resolves to it; the
 * env switch exists so a real provider can be added later without
 * touching call sites.
 */
export function getEmailProvider(): EmailProvider {
  if (provider) return provider;
  provider = new NoopEmailProvider();
  return provider;
}

export function setEmailProviderForTests(next: EmailProvider): void {
  provider = next;
}

export function __resetEmailProviderForTests(): void {
  provider = null;
}
