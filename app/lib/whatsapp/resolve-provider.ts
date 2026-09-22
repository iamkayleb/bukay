import { FakeWhatsAppProvider } from "@/app/lib/whatsapp/fake";
import { metaWhatsAppFromEnv } from "@/app/lib/whatsapp/meta";
import type { WhatsAppProvider } from "@/app/lib/whatsapp/provider";

let providerOverride: WhatsAppProvider | null = null;

/** Substitute FakeWhatsAppProvider (or any adapter) in unit tests. */
export function setWhatsAppProviderForTests(next: WhatsAppProvider): void {
  providerOverride = next;
}

export function __resetWhatsAppProviderForTests(): void {
  providerOverride = null;
}

/**
 * Resolve the active WhatsAppProvider.
 * Defaults to Fake so CI/local never need Meta credentials.
 * Set WHATSAPP_PROVIDER=meta (with tokens) for live sends.
 */
export function getWhatsAppProvider(): WhatsAppProvider {
  if (providerOverride) return providerOverride;
  if (process.env.WHATSAPP_PROVIDER === "meta") {
    return metaWhatsAppFromEnv();
  }
  return new FakeWhatsAppProvider();
}
