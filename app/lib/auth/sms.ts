import { MemorySmsProvider, SmsProvider, termiiFromEnv } from "@/app/lib/sms";

let provider: SmsProvider | null = null;

export function getSmsProvider(): SmsProvider {
  if (provider) return provider;
  if (process.env.SMS_PROVIDER === "termii") {
    provider = termiiFromEnv();
  } else {
    provider = new MemorySmsProvider();
  }
  return provider;
}

export function setSmsProviderForTests(next: SmsProvider): void {
  provider = next;
}

export function __resetSmsProviderForTests(): void {
  provider = null;
}
