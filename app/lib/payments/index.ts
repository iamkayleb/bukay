import { PaystackPaymentProvider } from "./paystack";
import type { PaymentProvider } from "./provider";

export function getPaymentProvider(provider: string): PaymentProvider | null {
  return provider === "paystack" ? new PaystackPaymentProvider() : null;
}
