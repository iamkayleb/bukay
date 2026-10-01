import { prisma } from "@/app/db/prisma";

export type TenantPaymentConfiguration = {
  id: string;
  paymentProvider: "PAYSTACK" | "FLUTTERWAVE";
};

const supportedPaymentProviders = ["PAYSTACK", "FLUTTERWAVE"] as const;

function isPaymentProvider(
  paymentProvider: string
): paymentProvider is TenantPaymentConfiguration["paymentProvider"] {
  return supportedPaymentProviders.includes(
    paymentProvider as (typeof supportedPaymentProviders)[number]
  );
}

/**
 * Loads only the payment configuration used to construct a tenant's payment
 * provider. Keeping this projection narrow prevents payment flows from
 * accidentally relying on unrelated tenant fields.
 */
export async function getTenantPaymentConfiguration(
  tenantId: string
): Promise<TenantPaymentConfiguration | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, paymentProvider: true },
  });

  if (!tenant) return null;
  if (!isPaymentProvider(tenant.paymentProvider)) {
    throw new Error(`Tenant ${tenant.id} has an unsupported payment provider`);
  }

  return { id: tenant.id, paymentProvider: tenant.paymentProvider };
}
