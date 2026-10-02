import { FlutterwavePaymentProvider } from "./flutterwave";
import { PaystackPaymentProvider } from "./paystack";
import type { PaymentProvider } from "./provider";

export function getPaymentProvider(provider: string): PaymentProvider | null {
  if (provider === "paystack") return new PaystackPaymentProvider();
  if (provider === "flutterwave") return new FlutterwavePaymentProvider();
  return null;
}
