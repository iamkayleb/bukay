import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TENANT_SCOPED_MODELS as DB_TENANT_SCOPED_MODELS } from "@/app/db/tenant-guard";
import { TENANT_SCOPED_MODELS as LIB_TENANT_SCOPED_MODELS } from "@/app/lib/tenant-guard";

const schemaPath = path.join(process.cwd(), "prisma", "schema.prisma");

function tenantScopedModelsFromSchema(schemaText: string) {
  const modelPattern = /^model\s+(\w+)\s*\{([\s\S]*?)^}/gm;
  const models: string[] = [];

  for (const match of schemaText.matchAll(modelPattern)) {
    const [, name, body] = match;
    if (/^\s*tenantId\s+String\b/m.test(body)) {
      models.push(name);
    }
  }

  return models.sort();
}

describe("tenant-scoped model list sync", () => {
  it("keeps tenant guard model lists aligned with the Prisma schema", () => {
    const schemaScopedModels = tenantScopedModelsFromSchema(readFileSync(schemaPath, "utf8"));

    expect([...DB_TENANT_SCOPED_MODELS].sort()).toEqual(schemaScopedModels);
    expect([...LIB_TENANT_SCOPED_MODELS].sort()).toEqual(schemaScopedModels);
  });
});
