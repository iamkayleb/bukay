-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Tag_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClientTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientTag_tenantId_clientId_fkey" FOREIGN KEY ("tenantId", "clientId") REFERENCES "Client" ("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClientTag_tenantId_tagId_fkey" FOREIGN KEY ("tenantId", "tagId") REFERENCES "Tag" ("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_tenantId_id_key" ON "Client"("tenantId", "id");

-- CreateIndex
CREATE INDEX "Tag_tenantId_idx" ON "Tag"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_tenantId_name_key" ON "Tag"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_tenantId_id_key" ON "Tag"("tenantId", "id");

-- CreateIndex
CREATE INDEX "ClientTag_tenantId_idx" ON "ClientTag"("tenantId");

-- CreateIndex
CREATE INDEX "ClientTag_tenantId_tagId_idx" ON "ClientTag"("tenantId", "tagId");

-- CreateIndex
CREATE INDEX "ClientTag_tenantId_clientId_idx" ON "ClientTag"("tenantId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientTag_tenantId_clientId_tagId_key" ON "ClientTag"("tenantId", "clientId", "tagId");
