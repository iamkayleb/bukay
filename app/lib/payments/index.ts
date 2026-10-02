import { FlutterwavePaymentProvider } from "./flutterwave";
import { PaystackPaymentProvider } from "./paystack";
import type { PaymentProvider } from "./provider";

export function getPaymentProvider(provider: string): PaymentProvider | null {
  switch (provider) {
    case "paystack":
      return new PaystackPaymentProvider();
    case "flutterwave":
      return new FlutterwavePaymentProvider();
    default:
      return null;
  }
}
