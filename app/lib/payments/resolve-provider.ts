import { FakePaymentProvider } from "@/app/lib/payments/fake";
import { flutterwaveFromEnv } from "@/app/lib/payments/flutterwave";
import { paystackFromEnv } from "@/app/lib/payments/paystack";
import type { PaymentProvider } from "@/app/lib/payments/provider";

export type PaymentProviderName = "paystack" | "flutterwave" | "fake";

let providerOverride: PaymentProvider | null = null;

export function setPaymentProviderForTests(next: PaymentProvider): void {
  providerOverride = next;
}

export function __resetPaymentProviderForTests(): void {
  providerOverride = null;
}

export function normalizePaymentProviderName(
  value: string | null | undefined
): PaymentProviderName | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "paystack" || normalized === "flutterwave" || normalized === "fake") {
    return normalized;
  }
  return null;
}

/** Build a PaymentProvider from a tenant (or env) selection string. */
export function createPaymentProvider(
  name: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env
): PaymentProvider {
  const normalized = normalizePaymentProviderName(name) ?? "fake";
  switch (normalized) {
    case "paystack":
      return paystackFromEnv(env);
    case "flutterwave":
      return flutterwaveFromEnv(env);
    case "fake":
    default:
      return new FakePaymentProvider();
  }
}

export function getPaymentProvider(): PaymentProvider {
  if (providerOverride) return providerOverride;
  return createPaymentProvider(process.env.PAYMENT_PROVIDER);
}
