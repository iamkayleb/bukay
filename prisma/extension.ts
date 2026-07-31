import { Prisma } from "@prisma/client";
import { assertTenantWhere } from "@/app/db/tenant-guard";

const TENANT_MODEL_DELEGATES = [
  "auditLog",
  "booking",
  "businessHour",
  "client",
  "payment",
  "service",
  "staff",
  "user",
] as const;

function pascalCase(delegate: string): string {
  return delegate.charAt(0).toUpperCase() + delegate.slice(1);
}

type QueryArgs = {
  model?: string;
  operation: string;
  args: unknown;
  query: (a: unknown) => Promise<unknown>;
};

function guardQuery({ model, operation, args, query }: QueryArgs): Promise<unknown> {
  if (model) {
    assertTenantWhere(model, operation, args);
  }
  return query(args);
}

const perModelHooks = Object.fromEntries(
  TENANT_MODEL_DELEGATES.map((delegate) => [
    delegate,
    {
      $allOperations({ operation, args, query }: Omit<QueryArgs, "model">) {
        return guardQuery({ model: pascalCase(delegate), operation, args, query });
      },
    },
  ])
);

export const tenantGuardExtension = Prisma.defineExtension({
  name: "tenant-guard",
  query: {
    ...perModelHooks,
    $allModels: {
      $allOperations(params: QueryArgs) {
        return guardQuery(params);
      },
    },
  },
});
