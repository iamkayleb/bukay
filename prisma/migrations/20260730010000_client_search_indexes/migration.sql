-- CreateIndex
CREATE INDEX "Client_tenantId_name_idx" ON "Client"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Client_tenantId_phone_idx" ON "Client"("tenantId", "phone");
