import { FakePaymentProvider } from "@/app/lib/payments/fake";
import { flutterwaveFromEnv } from "@/app/lib/payments/flutterwave";
import { paystackFromEnv } from "@/app/lib/payments/paystack";
import type { PaymentProvider } from "@/app/lib/payments/provider";

let providerOverride: PaymentProvider | null = null;

export function setPaymentProviderForTests(next: PaymentProvider): void {
  providerOverride = next;
}

export function __resetPaymentProviderForTests(): void {
  providerOverride = null;
}

export function getPaymentProvider(): PaymentProvider {
  if (providerOverride) return providerOverride;
  if (process.env.PAYMENT_PROVIDER === "paystack") {
    return paystackFromEnv();
  }
  if (process.env.PAYMENT_PROVIDER === "flutterwave") {
    return flutterwaveFromEnv();
  }
  return new FakePaymentProvider();
}
